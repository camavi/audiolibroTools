<?php

namespace Tests\Feature;

use App\Models\AudioLibraryVoice;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AudioLibraryTest extends TestCase
{
    use RefreshDatabase;

    public function test_voice_library_can_create_list_update_and_delete_tone_samples(): void
    {
        Storage::fake('public');

        $created = $this->post('/dashboard/api/audio-library/voices', [
            'name' => 'Elara',
            'type' => 'female',
            'language' => 'it',
            'description' => 'Warm Italian narrator.',
            'samples' => [[
                'tone_id' => 1,
                'description' => 'Gentle opening.',
                'file' => UploadedFile::fake()->create('elara-warm.wav', 20, 'audio/wav'),
            ]],
        ]);

        $created->assertCreated()
            ->assertJsonPath('data.voice.name', 'Elara')
            ->assertJsonPath('data.voice.samples.0.tone.id', 1)
            ->assertJsonPath('data.voice.samples.0.tone.name', 'whisper');

        $voice = AudioLibraryVoice::query()->firstOrFail();
        $this->assertSame('at', $voice->provider);
        $sample = $voice->samples()->firstOrFail();
        Storage::disk('public')->assertExists($sample->audio_path);

        $this->getJson('/dashboard/api/audio-library/voices?search=Elara')
            ->assertOk()
            ->assertJsonPath('data.voices.0.id', $voice->id)
            ->assertJsonPath('data.voices.0.samples.0.original_name', 'elara-warm.wav')
            ->assertJsonPath('data.tones.67.name', 'spectral');

        $this->get(route('dashboard.api.audio-library.samples.stream', $sample))
            ->assertOk();

        $this->post("/dashboard/api/audio-library/voices/{$voice->id}", [
            'name' => 'Elara',
            'type' => 'female',
            'language' => 'it',
            'samples' => [[
                'id' => $sample->id,
                'tone_id' => 32,
                'description' => 'Calm ending.',
            ]],
        ])
            ->assertOk()
            ->assertJsonPath('data.voice.samples.0.tone.id', 32)
            ->assertJsonPath('data.voice.samples.0.tone.name', 'relaxed');

        $this->deleteJson("/dashboard/api/audio-library/voices/{$voice->id}")
            ->assertOk()
            ->assertJsonPath('data.deleted', true);

        Storage::disk('public')->assertMissing($sample->audio_path);
        $this->assertDatabaseMissing('audio_library_voices', ['id' => $voice->id]);
    }
}
