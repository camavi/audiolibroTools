<?php

namespace App\Jobs;

use App\Models\BookBlockTranslation;
use App\Models\BookTranslationJob;
use App\Services\Ai\EditorAiTranslationService;
use App\Services\Credits\TranslationCreditService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

class ProcessBookTranslationJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 3600;

    public function __construct(public int $translationJobId) {}

    public function handle(EditorAiTranslationService $translations, TranslationCreditService $credits): void
    {
        $job = BookTranslationJob::query()->with('book')->find($this->translationJobId);

        if (! $job || ! in_array($job->status, ['queued', 'running'], true) || ! $job->book) {
            return;
        }

        $job->forceFill([
            'status' => 'running',
            'started_at' => $job->started_at ?: now(),
            'error_message' => null,
        ])->save();

        $book = $job->book;
        $translateAll = data_get($job->request_json, 'scope') === 'all';
        $accountId = $job->created_by ?: $book->account_id;
        $blocks = $book->blocks()
            ->with('currentVersion')
            ->where('status', '!=', 'deleted')
            ->whereNotNull('current_version_id')
            ->when(data_get($job->request_json, 'block_uuids'), fn ($query, $blockUuids) => $query->whereIn('block_uuid', $blockUuids))
            ->get();
        $pricing = data_get($job->request_json, 'token_pricing');

        foreach ($blocks as $block) {
            $job->refresh();
            if ($job->status !== 'running') {
                return;
            }

            $job->forceFill(['current_block_uuid' => $block->block_uuid])->save();
            $sourceText = $block->currentVersion->text_plain ?: $block->text_plain ?: '';
            $estimatedUsage = $credits->estimateUsage($sourceText);
            $blockCredits = is_array($pricing)
                ? $credits->quote($pricing, $estimatedUsage['input_tokens'], $estimatedUsage['output_tokens'])
                : 0;

            try {
                $approved = $block->translations()
                    ->where('source_book_block_version_id', $block->currentVersion->id)
                    ->where('target_locale', $job->target_locale)
                    ->where('status', 'approved')
                    ->exists();
                $existingDraft = $block->translations()
                    ->where('source_book_block_version_id', $block->currentVersion->id)
                    ->where('target_locale', $job->target_locale)
                    ->where('status', 'draft')
                    ->where('provider_key', $job->provider_key)
                    ->where('model', $job->model)
                    ->exists();

                if ((! $translateAll && ($approved || $existingDraft)) || ($translateAll && $existingDraft)) {
                    $credits->release($job, $blockCredits, 'existing_translation');
                    $this->advance($job, true);

                    continue;
                }

                $generated = $translations->generate(
                    $book,
                    $block,
                    $job->target_locale,
                    $job->provider_key,
                    $job->model,
                    $accountId,
                );
                $usage = $generated['usage'] ?? $estimatedUsage;
                $actualCredits = is_array($pricing)
                    ? $credits->quote($pricing, (int) ($usage['input_tokens'] ?? 0), (int) ($usage['output_tokens'] ?? 0))
                    : 0;

                BookBlockTranslation::query()->create([
                    'book_id' => $book->id,
                    'book_block_id' => $block->id,
                    'source_book_block_version_id' => $block->currentVersion->id,
                    'block_uuid' => $block->block_uuid,
                    'target_locale' => $job->target_locale,
                    'status' => 'draft',
                    'provider_key' => $job->provider_key,
                    'model' => $job->model,
                    'source' => $generated['source'],
                    'source_text' => $sourceText,
                    'translated_text' => $generated['translated_text'],
                    'notes_json' => [
                        'source_locale' => $book->lang,
                        'target_locale' => $job->target_locale,
                        'translation_job_id' => $job->id,
                        ...($generated['notes_json'] ?? []),
                    ],
                    'created_by' => $accountId,
                ]);

                $credits->consume($job, $actualCredits, [
                    'provider_key' => $job->provider_key,
                    'model' => $job->model,
                    'input_tokens' => (int) ($usage['input_tokens'] ?? 0),
                    'output_tokens' => (int) ($usage['output_tokens'] ?? 0),
                    'usage_source' => isset($generated['usage']) ? 'provider' : 'estimated',
                ]);
                $credits->release($job, max(0, $blockCredits - $actualCredits), 'translation_usage_below_estimate');
                $this->advance($job);
            } catch (Throwable $exception) {
                $credits->release($job, $blockCredits, 'block_failed');
                $job->increment('failed_blocks');
                $job->forceFill(['error_message' => $exception->getMessage()])->save();
                $this->advance($job);
            }
        }

        $job->refresh();
        $job->forceFill([
            'status' => $job->failed_blocks > 0 ? 'completed_with_errors' : 'completed',
            'current_block_uuid' => null,
            'completed_at' => now(),
        ])->save();
        $remainingCredits = max(0, $job->reserved_credits - $job->consumed_credits - $job->released_credits);
        $credits->release($job, $remainingCredits, 'translation_batch_completed');
    }

    public function failed(Throwable $exception): void
    {
        $job = BookTranslationJob::query()->with('book')->find($this->translationJobId);
        if (! $job) {
            return;
        }
        $remainingCredits = max(0, $job->reserved_credits - $job->consumed_credits - $job->released_credits);
        if ($remainingCredits > 0 && $job->book) {
            app(TranslationCreditService::class)->release($job, $remainingCredits, 'translation_job_failed');
        }
        $job->forceFill([
            'status' => 'failed',
            'error_message' => $exception->getMessage(),
            'completed_at' => now(),
        ])->save();
    }

    private function advance(BookTranslationJob $job, bool $skipped = false): void
    {
        $job->increment('completed_blocks');

        if ($skipped) {
            $job->increment('skipped_blocks');
        }
    }
}
