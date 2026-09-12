<?php

namespace App\Jobs;

use App\Models\BookBlock;
use App\Models\BookBlockReview;
use App\Models\BookCorrectionJob;
use App\Models\BookCorrectionJobFailure;
use App\Services\Ai\EditorAiCorrectionService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Cache\Lock;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Throwable;

/**
 * Processes exactly one saved block per queue invocation.
 *
 * A manuscript can take many hours with a local model, while a single queue
 * job must always remain short enough to survive worker time limits. The next
 * block is dispatched only after this block's outcome is persisted.
 */
class ProcessBookCorrectionJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 300;

    public int $tries = 1;

    private const LOCK_SECONDS = 360;

    public function __construct(
        public int $correctionJobId,
        public ?string $dispatchToken = null,
    ) {}

    public static function dispatchFor(BookCorrectionJob $job): void
    {
        $token = (string) Str::uuid();
        $job->forceFill([
            'request_json' => [
                ...($job->request_json ?? []),
                'dispatch_token' => $token,
            ],
        ])->save();

        self::dispatch($job->id, $token);
    }

    public function handle(EditorAiCorrectionService $corrections): void
    {
        $lock = Cache::lock($this->lockName(), self::LOCK_SECONDS);
        if (! $lock->get()) {
            // A watchdog or a duplicate delivery may queue this job while the
            // current block is still running. The owner will enqueue the next
            // block, so this duplicate can safely disappear.
            return;
        }

        try {
            $this->processNextBlock($corrections);
        } finally {
            $this->releaseLock($lock);
        }
    }

    public function failed(Throwable $exception): void
    {
        $job = BookCorrectionJob::query()->find($this->correctionJobId);
        if (! $job || ! $this->isCurrentDispatch($job) || ! in_array($job->status, ['queued', 'running'], true)) {
            return;
        }

        $job->forceFill([
            'status' => 'failed',
            'error_message' => $exception->getMessage(),
            'current_block_uuid' => null,
            'completed_at' => now(),
        ])->save();
    }

    private function processNextBlock(EditorAiCorrectionService $corrections): void
    {
        $job = BookCorrectionJob::query()->with('book')->find($this->correctionJobId);
        if (! $job || ! in_array($job->status, ['queued', 'running'], true) || ! $job->book) {
            return;
        }
        if (! $this->isCurrentDispatch($job)) {
            return;
        }

        $job->forceFill([
            'status' => 'running',
            'started_at' => $job->started_at ?: now(),
            'error_message' => null,
        ])->save();

        $blockUuids = $this->blockUuids($job);
        $nextIndex = max(0, (int) $job->completed_blocks);

        if (! isset($blockUuids[$nextIndex])) {
            $this->complete($job);

            return;
        }

        $book = $job->book;
        $block = $book->blocks()
            ->with('currentVersion')
            ->where('status', '!=', 'deleted')
            ->whereNotNull('current_version_id')
            ->where('block_uuid', $blockUuids[$nextIndex])
            ->first();

        if (! $block || ! $block->currentVersion) {
            $this->advance($job, true);
            $this->dispatchNext($job);

            return;
        }

        $job->forceFill(['current_block_uuid' => $block->block_uuid])->save();

        $skipped = false;
        try {
            $skipped = $this->createOrReuseDraft($job, $block, $corrections);
        } catch (Throwable $exception) {
            $message = $this->exceptionMessage($exception);
            $this->recordFailure($job, $block, $message);
            $job->increment('failed_blocks');
            $job->forceFill(['error_message' => $message])->save();
        }

        $this->advance($job, $skipped);
        $this->dispatchNext($job);
    }

    /** @return array<int, string> */
    private function blockUuids(BookCorrectionJob $job): array
    {
        return collect(data_get($job->request_json, 'block_uuids', []))
            ->filter(fn ($uuid) => is_string($uuid) && $uuid !== '')
            ->values()
            ->all();
    }

    private function createOrReuseDraft(
        BookCorrectionJob $job,
        BookBlock $block,
        EditorAiCorrectionService $corrections,
    ): bool {
        $existingDraft = $block->reviews()
            ->where('book_block_version_id', $block->currentVersion->id)
            ->where('type', 'grammar')
            ->where('status', 'draft')
            ->where('notes_json->provider_key', $job->provider_key)
            ->where('notes_json->model', $job->model)
            ->exists();
        $hasAnyDraft = $block->reviews()
            ->where('book_block_version_id', $block->currentVersion->id)
            ->where('type', 'grammar')
            ->where('status', 'draft')
            ->exists();
        $correctAll = data_get($job->request_json, 'scope') === 'all';

        if ($existingDraft || (! $correctAll && $hasAnyDraft)) {
            $this->resolveRetriedFailures($job, $block->id);

            return true;
        }

        $accountId = $job->created_by ?: $job->book->account_id;
        $correction = $corrections->generate(
            $job->book,
            $block,
            'grammar',
            $job->provider_key,
            $job->model,
            $accountId,
        );

        BookBlockReview::query()->create([
            'book_id' => $job->book_id,
            'book_block_id' => $block->id,
            'book_block_version_id' => $block->currentVersion->id,
            'type' => 'grammar',
            'status' => 'draft',
            'source' => $correction['source'],
            'original_text' => $correction['original_text'],
            'suggested_text' => $correction['suggested_text'],
            'notes_json' => [
                'correction_job_id' => $job->id,
                ...($correction['notes_json'] ?? []),
            ],
            'created_by' => $accountId,
        ]);

        $this->resolveRetriedFailures($job, $block->id);

        return false;
    }

    private function dispatchNext(BookCorrectionJob $job): void
    {
        $job->refresh();
        if ($job->status !== 'running') {
            return;
        }

        if ($job->completed_blocks >= $job->total_blocks) {
            $this->complete($job);

            return;
        }

        $job->forceFill(['current_block_uuid' => null])->save();
        self::dispatchFor($job);
    }

    private function complete(BookCorrectionJob $job): void
    {
        $job->refresh();
        if ($job->status !== 'running') {
            return;
        }

        $job->forceFill([
            'status' => $job->failed_blocks > 0 ? 'completed_with_errors' : 'completed',
            'current_block_uuid' => null,
            'completed_at' => now(),
        ])->save();
    }

    private function advance(BookCorrectionJob $job, bool $skipped = false): void
    {
        $job->increment('completed_blocks');
        if ($skipped) {
            $job->increment('skipped_blocks');
        }
    }

    private function recordFailure(BookCorrectionJob $job, BookBlock $block, string $message): void
    {
        $failure = BookCorrectionJobFailure::query()->firstOrNew([
            'book_correction_job_id' => $job->id,
            'book_block_id' => $block->id,
            'book_block_version_id' => $block->currentVersion->id,
        ]);
        $failure->forceFill([
            'book_id' => $job->book_id,
            'block_uuid' => $block->block_uuid,
            'error_message' => $message,
            'attempts' => (int) ($failure->attempts ?: 0) + 1,
            'last_attempt_at' => now(),
            'resolved_at' => null,
        ])->save();
    }

    private function resolveRetriedFailures(BookCorrectionJob $job, int $blockId): void
    {
        $failureIds = collect(data_get($job->request_json, 'retry_failure_ids', []))
            ->map(fn ($id) => (int) $id)
            ->filter()
            ->all();
        if (! $failureIds) {
            return;
        }

        BookCorrectionJobFailure::query()
            ->whereIn('id', $failureIds)
            ->where('book_block_id', $blockId)
            ->whereNull('resolved_at')
            ->update(['resolved_at' => now(), 'updated_at' => now()]);
    }

    private function exceptionMessage(Throwable $exception): string
    {
        if ($exception instanceof HttpResponseException) {
            $message = data_get($exception->getResponse()->getData(true), 'message');
            if (is_string($message) && $message !== '') {
                return $message;
            }
        }

        return $exception->getMessage() ?: 'Unable to create a correction draft.';
    }

    private function lockName(): string
    {
        return "book-correction-job:{$this->correctionJobId}";
    }

    private function isCurrentDispatch(BookCorrectionJob $job): bool
    {
        // A legacy job is current only until a recovery creates a token. This
        // prevents its delayed failed() callback from overwriting that newer
        // recovery's state.
        if (! $this->dispatchToken) {
            return blank(data_get($job->request_json, 'dispatch_token'));
        }

        return hash_equals(
            (string) data_get($job->request_json, 'dispatch_token', ''),
            $this->dispatchToken,
        );
    }

    private function releaseLock(Lock $lock): void
    {
        try {
            $lock->release();
        } catch (Throwable) {
            // The lock has a short expiry and must never hide an AI error.
        }
    }
}
