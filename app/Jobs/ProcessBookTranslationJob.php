<?php

namespace App\Jobs;

use App\Models\BookBlock;
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

    public function __construct(public int $translationJobId)
    {
    }

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
        $accountId = $job->created_by ?: $book->account_id;
        $blocks = $book->blocks()
            ->with('currentVersion')
            ->where('status', '!=', 'deleted')
            ->whereNotNull('current_version_id')
            ->get();

        foreach ($blocks as $block) {
            $job->refresh();
            if ($job->status !== 'running') {
                return;
            }

            $job->forceFill(['current_block_uuid' => $block->block_uuid])->save();
            $blockCredits = $credits->quote($job->model, str_word_count($block->currentVersion->text_plain ?: $block->text_plain ?: ''));

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

                if ($approved || $existingDraft) {
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
                $sourceText = $block->currentVersion->text_plain ?: $block->text_plain ?: '';

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

                $credits->consume($job, $blockCredits);
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
    }

    public function failed(Throwable $exception): void
    {
        BookTranslationJob::query()->whereKey($this->translationJobId)->update([
            'status' => 'failed',
            'error_message' => $exception->getMessage(),
            'completed_at' => now(),
        ]);
    }

    private function advance(BookTranslationJob $job, bool $skipped = false): void
    {
        $job->increment('completed_blocks');

        if ($skipped) {
            $job->increment('skipped_blocks');
        }
    }
}
