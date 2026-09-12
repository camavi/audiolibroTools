<?php

namespace App\Jobs;

use App\Http\Controllers\DashboardBookController;
use App\Models\BookAudioPublication;
use App\Models\User;
use App\Notifications\AudioReleaseRendered;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

class RenderBookAudioPublication implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 7200;
    public int $tries = 1;

    public function __construct(public int $releaseId)
    {
        $this->onQueue('audio-release');
    }

    public function handle(DashboardBookController $audio): void
    {
        $release = BookAudioPublication::query()->with('book')->find($this->releaseId);
        if (! $release || ! $release->book || ! in_array($release->status, ['queued', 'building'], true)) {
            return;
        }

        $release->forceFill([
            'status' => 'building',
            'progress_percent' => max(1, (int) $release->progress_percent),
            'started_at' => $release->started_at ?: now(),
            'failure_message' => null,
        ])->save();

        $lastProgress = -1;
        $progress = function (int $percent) use ($release, &$lastProgress): void {
            $percent = max(1, min(99, $percent));
            if ($percent === $lastProgress) {
                return;
            }
            $lastProgress = $percent;
            $release->forceFill(['progress_percent' => $percent])->save();
        };

        try {
            $rendered = $audio->renderFrozenAudioTimeline($release->book, $release->timeline_snapshot_json ?? [], $release->version_number, $progress);
            $release->forceFill([
                'masters_json' => $rendered['channels'],
                'duration_ms' => $rendered['duration_ms'],
                'status' => 'ready',
                'progress_percent' => 100,
                'failure_message' => null,
                'published_at' => now(),
                'completed_at' => now(),
            ])->save();
            $this->notifyCreator($release, true);
        } catch (Throwable $exception) {
            report($exception);
            $release->forceFill([
                'status' => 'failed',
                'is_online' => false,
                'failure_message' => mb_substr($exception->getMessage(), 0, 1000),
                'completed_at' => now(),
            ])->save();
            $this->notifyCreator($release, false);
        }
    }

    public function failed(Throwable $exception): void
    {
        $release = BookAudioPublication::query()->with('book')->find($this->releaseId);
        if (! $release || ! in_array($release->status, ['queued', 'building'], true)) {
            return;
        }
        $release->forceFill([
            'status' => 'failed',
            'is_online' => false,
            'failure_message' => mb_substr($exception->getMessage(), 0, 1000),
            'completed_at' => now(),
        ])->save();
        $this->notifyCreator($release, false);
    }

    private function notifyCreator(BookAudioPublication $release, bool $successful): void
    {
        $user = $release->created_by ? User::query()->find($release->created_by) : null;
        if (! $user?->email || ! $release->book) {
            return;
        }
        try {
            $user->notify(new AudioReleaseRendered($release, $release->book->name, $successful));
        } catch (Throwable $exception) {
            report($exception);
        }
    }
}
