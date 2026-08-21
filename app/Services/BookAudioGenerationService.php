<?php

namespace App\Services;

use App\Models\BookAudioJob;
use App\Models\BookAudioSegment;
use App\Models\AudioLibraryVoice;
use App\Models\AudioLibraryVoiceSample;
use App\Services\QwenTtsService;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

class BookAudioGenerationService
{
    public function generate(int $audioJobId): void
    {
        $job = BookAudioJob::query()->with(['book', 'block', 'blockVersion', 'voiceProfile'])->find($audioJobId);
        if (! $job || $job->status !== 'queued' || ! $job->book || ! $job->block || ! $job->blockVersion || ! $job->voiceProfile) return;

        $job->forceFill(['status' => 'running', 'started_at' => now(), 'error_message' => null])->save();
        $request = $job->request_json ?? [];
        $parts = $request['parts'] ?? [];
        $qwen = app(QwenTtsService::class);
        $segments = collect();

        try {
            foreach ($parts as $index => $part) {
                $toneId = $request['split_tones'][$index] ?? $request['tone_id'] ?? null;
                $voiceId = $this->voiceId($job, $request, $toneId, $qwen);
                $durationMs = max(700, mb_strlen((string) ($part['text'] ?? '')) * 45);
                $audioPath = "mock://books/{$job->book->key_book}/blocks/{$job->block_uuid}/audio/{$index}";
                $result = ['mock' => true, 'duration_ms' => $durationMs];

                if ($job->provider_key === 'qwen-local') {
                    $result = $qwen->synthesize($this->ttsReadyText((string) $part['source_text']), (string) $request['language'], $voiceId, (string) $job->model);
                    $audioPath = "audiobooks/{$job->book->key_book}/segments/".Str::uuid().'.wav';
                    Storage::disk('public')->put($audioPath, $qwen->download($result['audio_url']));
                    $durationMs = (int) ($result['duration_ms'] ?? $durationMs);
                }

                $segments->push(BookAudioSegment::query()->create([
                    'book_id' => $job->book_id, 'book_edition_id' => $job->book_edition_id, 'book_block_id' => $job->book_block_id,
                    'book_block_version_id' => $job->book_block_version_id, 'book_voice_profile_id' => $job->book_voice_profile_id,
                    'book_audio_job_id' => $job->id, 'block_uuid' => $job->block_uuid,
                    'status' => 'completed', 'provider_key' => $job->provider_key, 'model' => $job->model,
                    'voice_id' => $voiceId, 'audio_path' => $audioPath, 'duration_ms' => $durationMs, 'segment_index' => $index,
                    'source_start' => $part['start'], 'source_end' => $part['end'], 'pause_after_ms' => $part['pause_after_ms'],
                    'text_plain' => $part['source_text'], 'content_hash' => $job->blockVersion->content_hash,
                    'metadata_json' => [
                        'source' => $job->source,
                        'spoken_text' => $part['text'],
                        'alignment_status' => $result['alignment']['status'] ?? 'unavailable',
                        'alignment_language' => $result['alignment']['language'] ?? ($request['language'] ?? null),
                        // The timeline highlight uses manuscript-wide Unicode
                        // offsets, while Qwen returns offsets local to each
                        // generated clip. Preserve the mapping used before
                        // generation moved to the queue worker.
                        'word_timings' => $this->attachWordSourceOffsets(
                            $result['alignment']['words'] ?? [],
                            (string) $part['source_text'],
                            (int) $part['start'],
                        ),
                    ],
                    'created_by' => $job->created_by,
                ]));
            }

            $duration = $segments->sum(fn (BookAudioSegment $segment) => (int) $segment->duration_ms + (int) $segment->pause_after_ms);
            $job->forceFill(['status' => 'completed', 'result_json' => ['parts' => $segments->count(), 'duration_ms' => $duration], 'completed_at' => now()])->save();
        } catch (Throwable $exception) {
            $job->forceFill(['status' => 'failed', 'error_message' => $exception->getMessage(), 'completed_at' => now()])->save();
            throw $exception;
        }
    }

    private function ttsReadyText(string $text): string
    {
        $text = rtrim($text);
        return preg_match('/[.!?…][\\]\\[\\)\\}”’"”]*$/u', $text) === 1 ? $text : $text.'.';
    }

    private function voiceId(BookAudioJob $job, array $request, mixed $toneId, QwenTtsService $qwen): string
    {
        $voiceId = (string) ($request['voice_id'] ?? $job->voiceProfile->voice_id);
        $libraryVoiceId = $request['audio_library_voice_id'] ?? null;
        if (! $libraryVoiceId || ! $toneId) return $voiceId;

        $sample = AudioLibraryVoiceSample::query()->where('audio_library_voice_id', $libraryVoiceId)->where('tone_id', $toneId)->first();
        if (! $sample || ! Storage::disk('public')->exists($sample->audio_path) || ! filled($sample->reference_text)) return $voiceId;
        if (! filled($sample->provider_voice_id)) {
            $voice = AudioLibraryVoice::query()->find($libraryVoiceId);
            $sample->forceFill(['provider_voice_id' => $qwen->registerVoice($voice?->name ?: $job->voiceProfile->name, Storage::disk('public')->path($sample->audio_path), $sample->reference_text)])->save();
        }
        return $sample->provider_voice_id;
    }

    /**
     * Map provider timing words to the full source-text offsets used by the
     * editor and audio timeline for progressive text highlighting.
     *
     * @param array<int, array<string, mixed>> $timings
     * @return array<int, array<string, mixed>>
     */
    private function attachWordSourceOffsets(array $timings, string $sourceText, int $segmentStart): array
    {
        $cursor = 0;
        $mapped = [];

        foreach ($timings as $timing) {
            $word = trim((string) ($timing['word'] ?? ''));
            $needle = preg_replace('/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/u', '', $word) ?? '';
            if ($needle === '') continue;

            $position = mb_stripos($sourceText, $needle, $cursor, 'UTF-8');
            if ($position === false) continue;

            $length = mb_strlen($needle, 'UTF-8');
            $mapped[] = [...$timing, 'source_start' => $segmentStart + $position, 'source_end' => $segmentStart + $position + $length];
            $cursor = $position + $length;
        }

        return $mapped;
    }
}
