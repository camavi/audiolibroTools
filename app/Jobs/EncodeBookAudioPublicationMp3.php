<?php

namespace App\Jobs;

use App\Models\BookAudioPublication;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Symfony\Component\Process\Process;
use Throwable;

class EncodeBookAudioPublicationMp3 implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 7200;
    public int $tries = 1;

    public function __construct(public int $releaseId)
    {
        $this->onQueue('audio-release');
    }

    public function handle(): void
    {
        $release = BookAudioPublication::query()->find($this->releaseId);
        if (! $release || $release->status !== 'ready' || ! in_array($release->mp3_status, ['queued', 'building'], true)) {
            return;
        }

        $release->forceFill([
            'mp3_status' => 'building',
            'mp3_progress_percent' => max(1, (int) $release->mp3_progress_percent),
            'mp3_failure_message' => null,
        ])->save();

        try {
            $masters = $release->masters_json ?? [];
            $tracks = collect(['voice', 'music', 'fx'])
                ->filter(fn (string $track): bool => filled(data_get($masters, "{$track}.path")) && Storage::disk('public')->exists(data_get($masters, "{$track}.path")))
                ->values();
            if ($tracks->isEmpty()) {
                throw new RuntimeException('No WAV master is available for MP3 conversion.');
            }

            $lastProgress = -1;
            foreach ($tracks as $index => $track) {
                $source = data_get($masters, "{$track}.path");
                $target = preg_replace('/\\.wav$/i', '.mp3', $source) ?: "{$source}.mp3";
                Storage::disk('public')->makeDirectory(dirname($target));
                $durationMs = max(1, (int) (data_get($masters, "{$track}.duration_ms") ?: $release->duration_ms));
                $this->encode(
                    Storage::disk('public')->path($source),
                    Storage::disk('public')->path($target),
                    $durationMs,
                    function (float $trackProgress) use ($release, $tracks, $index, &$lastProgress): void {
                        $percent = max(1, min(99, (int) floor((($index + $trackProgress) / $tracks->count()) * 100)));
                        if ($percent === $lastProgress) {
                            return;
                        }
                        $lastProgress = $percent;
                        $release->forceFill(['mp3_progress_percent' => $percent])->save();
                    },
                );
                data_set($masters, "{$track}.mp3_path", $target);
            }

            $release->forceFill([
                'masters_json' => $masters,
                'mp3_status' => 'ready',
                'mp3_progress_percent' => 100,
                'mp3_failure_message' => null,
            ])->save();
        } catch (Throwable $exception) {
            report($exception);
            $release->forceFill([
                'mp3_status' => 'failed',
                'mp3_failure_message' => mb_substr($exception->getMessage(), 0, 1000),
            ])->save();
        }
    }

    private function encode(string $source, string $target, int $durationMs, callable $progress): void
    {
        $process = new Process([
            config('audiobook.ffmpeg_binary', env('FFMPEG_BINARY', 'ffmpeg')), '-y', '-i', $source,
            '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', '-progress', 'pipe:1', '-nostats', $target,
        ]);
        $process->setTimeout(0);
        $buffered = '';
        $process->run(function (string $type, string $buffer) use (&$buffered, $progress, $durationMs): void {
            if ($type !== Process::OUT) {
                return;
            }
            $buffered .= $buffer;
            while (($newline = strpos($buffered, "\n")) !== false) {
                $line = trim(substr($buffered, 0, $newline));
                $buffered = substr($buffered, $newline + 1);
                if (str_starts_with($line, 'out_time_us=')) {
                    $progress(max(0, min(1, ((float) substr($line, 12) / 1000) / $durationMs)));
                }
            }
        });
        if (! $process->isSuccessful()) {
            throw new RuntimeException('MP3 conversion failed: '.trim($process->getErrorOutput() ?: $process->getOutput()));
        }
    }
}
