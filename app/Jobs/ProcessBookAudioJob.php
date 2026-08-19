<?php

namespace App\Jobs;

use App\Models\BookAudioJob;
use App\Services\BookAudioGenerationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

class ProcessBookAudioJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 1800;
    public int $tries = 1;

    public function __construct(public int $audioJobId)
    {
        $this->onQueue('tts');
    }

    public function handle(BookAudioGenerationService $generator): void
    {
        $generator->generate($this->audioJobId);
    }

    public function failed(Throwable $exception): void
    {
        BookAudioJob::query()->whereKey($this->audioJobId)->whereIn('status', ['queued', 'running'])->update([
            'status' => 'failed',
            'error_message' => $exception->getMessage(),
            'completed_at' => now(),
        ]);
    }
}
