<?php

namespace App\Console\Commands;

use App\Jobs\ProcessBookCorrectionJob;
use App\Models\BookCorrectionJob;
use Illuminate\Console\Command;
use Illuminate\Contracts\Cache\Lock;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

class RecoverStalledBookCorrectionJobs extends Command
{
    protected $signature = 'corrections:recover-stalled
                            {--minutes=6 : Minutes without a saved correction-job update before recovery}
                            {--job= : Recover only one correction-job ID}
                            {--include-failed : Also recover a known worker infrastructure failure}';

    protected $description = 'Requeue active manuscript-correction jobs that stopped making progress.';

    private const LOCK_SECONDS = 360;

    public function handle(): int
    {
        $minutes = max(3, min(120, (int) $this->option('minutes')));
        $cutoff = now()->subMinutes($minutes);
        $jobId = (int) $this->option('job');
        $includeFailed = (bool) $this->option('include-failed');
        $jobs = BookCorrectionJob::query()
            ->when($jobId > 0, fn ($query) => $query->whereKey($jobId))
            ->where(function ($query) use ($cutoff, $includeFailed): void {
                $query->where(function ($active) use ($cutoff): void {
                    $active->whereIn('status', ['queued', 'running'])
                        ->where('updated_at', '<=', $cutoff);
                });

                if ($includeFailed) {
                    $query->orWhere(function ($failed): void {
                        $failed->where('status', 'failed')
                            ->where(function ($message): void {
                                $message->where('error_message', 'like', '%ProcessBookCorrectionJob has been attempted too many times%')
                                    ->orWhere('error_message', 'like', '%database is locked%');
                            });
                    });
                }
            })
            ->orderBy('id')
            ->get(['id', 'status', 'completed_blocks', 'total_blocks', 'current_block_uuid', 'updated_at']);

        $recovered = 0;

        foreach ($jobs as $job) {
            $lock = Cache::lock($this->lockName($job->id), self::LOCK_SECONDS);
            if (! $lock->get()) {
                continue;
            }

            try {
                $updated = BookCorrectionJob::query()
                    ->whereKey($job->id)
                    ->where(function ($current) use ($cutoff, $includeFailed): void {
                        $current->where(function ($active) use ($cutoff): void {
                            $active->whereIn('status', ['queued', 'running'])
                                ->where('updated_at', '<=', $cutoff);
                        });

                        if ($includeFailed) {
                            $current->orWhere(function ($failed): void {
                                $failed->where('status', 'failed')
                                    ->where(function ($message): void {
                                        $message->where('error_message', 'like', '%ProcessBookCorrectionJob has been attempted too many times%')
                                            ->orWhere('error_message', 'like', '%database is locked%');
                                    });
                            });
                        }
                    })
                    ->update([
                        'status' => 'queued',
                        'current_block_uuid' => null,
                        'error_message' => 'Recovered automatically after correction progress stopped.',
                        'updated_at' => now(),
                    ]);

                if (! $updated) {
                    continue;
                }

                $freshJob = BookCorrectionJob::query()->find($job->id);
                if ($freshJob) {
                    ProcessBookCorrectionJob::dispatchFor($freshJob);
                }
                $recovered++;

                Log::warning('Recovered a stalled manuscript correction job.', [
                    'correction_job_id' => $job->id,
                    'completed_blocks' => $job->completed_blocks,
                    'total_blocks' => $job->total_blocks,
                    'last_update' => $job->updated_at?->toIso8601String(),
                ]);
            } finally {
                $this->releaseLock($lock);
            }
        }

        $this->info("Recovered {$recovered} stalled correction job(s).");

        return self::SUCCESS;
    }

    private function lockName(int $jobId): string
    {
        return "book-correction-job:{$jobId}";
    }

    private function releaseLock(Lock $lock): void
    {
        try {
            $lock->release();
        } catch (Throwable) {
            // The expiry is a final safeguard if the cache backend is unavailable.
        }
    }
}
