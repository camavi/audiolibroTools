<?php

namespace App\Http\Controllers;

use App\Models\AudioLibraryTone;
use App\Models\AudioLibraryVoice;
use App\Models\AudioLibraryVoiceSample;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class AudioLibraryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));
        $voices = AudioLibraryVoice::query()
            ->where('account_id', auth()->id())
            ->when($search !== '', fn ($query) => $query->where(fn ($nested) => $nested->where('name', 'like', "%{$search}%")->orWhere('language', 'like', "%{$search}%")->orWhere('description', 'like', "%{$search}%")))
            ->with('samples.toneDefinition')
            ->latest('updated_at')
            ->get();

        return response()->json(['data' => [
            'voices' => $voices->map(fn (AudioLibraryVoice $voice) => $this->voice($voice))->values(),
            'tones' => AudioLibraryTone::query()->where('enabled', true)->orderBy('id')->get()->map(fn (AudioLibraryTone $tone) => $this->tone($tone))->values(),
        ]]);
    }

    public function store(Request $request): JsonResponse
    {
        return $this->save($request, new AudioLibraryVoice, 201);
    }

    public function update(Request $request, AudioLibraryVoice $voice): JsonResponse
    {
        abort_unless($voice->account_id === auth()->id(), 404);

        return $this->save($request, $voice);
    }

    public function destroy(AudioLibraryVoice $voice): JsonResponse
    {
        abort_unless($voice->account_id === auth()->id(), 404);
        foreach ($voice->samples as $sample) {
            Storage::disk('public')->delete($sample->audio_path);
        }
        $voice->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }

    public function stream(AudioLibraryVoiceSample $sample)
    {
        abort_unless($sample->voice->account_id === auth()->id(), 404);
        abort_unless(Storage::disk('public')->exists($sample->audio_path), 404);

        return response()->file(Storage::disk('public')->path($sample->audio_path), [
            'Content-Type' => mime_content_type(Storage::disk('public')->path($sample->audio_path)) ?: 'audio/wav',
            'Accept-Ranges' => 'bytes',
        ]);
    }

    private function save(Request $request, AudioLibraryVoice $voice, int $status = 200): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:160'], 'type' => ['required', 'in:male,female,neutral'], 'language' => ['required', 'string', 'max:20'], 'description' => ['nullable', 'string', 'max:5000'],
            'samples' => ['nullable', 'array', 'max:20'], 'samples.*.id' => ['nullable', 'integer'], 'samples.*.tone_id' => ['required', 'integer', 'exists:audio_library_tones,id'], 'samples.*.description' => ['nullable', 'string', 'max:3000'], 'samples.*.file' => ['nullable', 'file', 'mimetypes:audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg', 'max:51200'],
        ]);
        $voice->fill([...collect($data)->except('samples')->all(), 'account_id' => $voice->account_id ?: auth()->id()]);
        if (! $voice->provider) {
            $voice->provider = 'at';
        }
        $voice->save();
        $existing = $voice->samples()->get()->keyBy('id');
        $kept = [];
        foreach ($data['samples'] ?? [] as $sampleData) {
            $sample = ! empty($sampleData['id']) ? $existing->get($sampleData['id']) : null;
            if (! $sample) {
                $sample = new AudioLibraryVoiceSample(['audio_library_voice_id' => $voice->id]);
            }
            $file = $sampleData['file'] ?? null;
            if (! $file && ! $sample->exists) {
                continue;
            }
            if ($file) {
                if ($sample->audio_path) {
                    Storage::disk('public')->delete($sample->audio_path);
                }
                $sample->audio_path = $file->store("audio-library/{$voice->id}", 'public');
                $sample->original_name = $file->getClientOriginalName();
            }
            $tone = AudioLibraryTone::query()->findOrFail($sampleData['tone_id']);
            $sample->fill([
                'tone_id' => $tone->id,
                'tone' => $tone->name,
                'description' => $sampleData['description'] ?? null,
            ])->save();
            $kept[] = $sample->id;
        }
        $voice->samples()->whereNotIn('id', $kept)->get()->each(function (AudioLibraryVoiceSample $sample) {
            Storage::disk('public')->delete($sample->audio_path);
            $sample->delete();
        });

        return response()->json(['data' => ['voice' => $this->voice($voice->fresh('samples.toneDefinition'))]], $status);
    }

    private function voice(AudioLibraryVoice $voice): array
    {
        return [
            ...$voice->only(['id', 'name', 'type', 'language', 'description', 'created_at', 'updated_at']),
            'samples' => $voice->samples->map(fn (AudioLibraryVoiceSample $sample) => [
                ...$sample->only(['id', 'tone_id', 'description', 'original_name', 'duration_ms']),
                'tone' => $sample->toneDefinition ? $this->tone($sample->toneDefinition) : null,
                'audio_url' => route('dashboard.api.audio-library.samples.stream', $sample),
            ])->values(),
        ];
    }

    private function tone(AudioLibraryTone $tone): array
    {
        return $tone->only(['id', 'name', 'description', 'color']);
    }
}
