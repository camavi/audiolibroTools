<?php

namespace Tests\Feature;

use App\Models\AudioLibraryVoice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AudioLibraryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->create());
    }

    public function test_voice_library_can_create_list_update_and_delete_tone_samples(): void
    {
        Storage::fake('public');
        Http::fake([
            'http://127.0.0.1:8020/v1/transcribe' => Http::response([
                'data' => ['text' => 'Buongiorno, questa è Elara.', 'language' => 'it'],
            ]),
        ]);

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
            ->assertJsonPath('data.voice.samples.0.tone.name', 'whisper')
            ->assertJsonPath('data.voice.samples.0.reference_text', 'Buongiorno, questa è Elara.');

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

    public function test_voice_library_can_create_a_qwen_designed_voice(): void
    {
        Storage::fake('public');
        Http::fake([
            'http://127.0.0.1:8020/v1/voice-design' => Http::response([
                'data' => ['audio_url' => '/v1/audio/designed-voice', 'duration_ms' => 3600],
            ], 201),
            'http://127.0.0.1:8020/v1/audio/designed-voice' => Http::response('generated-wav'),
        ]);

        $response = $this->postJson('/dashboard/api/audio-library/design-voices', [
            'name' => 'Elara designed',
            'type' => 'female',
            'language' => 'it',
            'description' => 'Italian adult narrator with a warm, clear voice.',
            'tones' => [[
                'tone_id' => 10,
                'design_prompt' => 'Calm, evocative and intimate documentary narration.',
                'reference_text' => 'Benvenuti in questa breve frase di riferimento.',
            ]],
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.voice.provider', 'at-qwen-design')
            ->assertJsonPath('data.voice.samples.0.reference_text', 'Benvenuti in questa breve frase di riferimento.')
            ->assertJsonPath('data.voice.samples.0.design_prompt', 'Calm, evocative and intimate documentary narration.');

        $sample = AudioLibraryVoice::query()->firstOrFail()->samples()->firstOrFail();
        Storage::disk('public')->assertExists($sample->audio_path);
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/v1/voice-design')
            && $request['instruct'] === "Voice gender requirement: female. Generate a clearly feminine adult female voice; never a male voice.\n\nVoice language requirement: Italian (it). Speak only in Italian; do not use English unless Italian is English.\n\nItalian adult narrator with a warm, clear voice.\n\nCalm, evocative and intimate documentary narration.");
    }

    public function test_qwen_designed_voice_can_save_details_and_regenerate_one_tone_without_an_audio_upload(): void
    {
        Storage::fake('public');
        Http::fake([
            'http://127.0.0.1:8020/v1/voice-design' => Http::response([
                'data' => ['audio_url' => '/v1/audio/designed-voice', 'duration_ms' => 3600],
            ], 201),
            'http://127.0.0.1:8020/v1/audio/designed-voice' => Http::response('generated-wav'),
        ]);
        $voice = AudioLibraryVoice::query()->create([
            'account_id' => auth()->id(), 'name' => 'Old design', 'type' => 'female', 'language' => 'it', 'provider' => 'at-qwen-design',
        ]);
        $oldSample = $voice->samples()->create([
            'tone_id' => 1, 'tone' => 'whisper', 'audio_path' => "audio-library/{$voice->id}/old.wav", 'original_name' => 'old.wav',
        ]);
        Storage::disk('public')->put($oldSample->audio_path, 'old-wav');

        $this->postJson("/dashboard/api/audio-library/design-voices/{$voice->id}", [
            'name' => 'Updated design',
            'type' => 'neutral',
            'language' => 'en',
            'description' => 'Clear, young adult narrator.',
        ])->assertOk()
            ->assertJsonPath('data.voice.name', 'Updated design');

        Storage::disk('public')->assertExists($oldSample->audio_path);

        $this->postJson("/dashboard/api/audio-library/design-voices/{$voice->id}/tones", [
            'name' => 'Updated design',
            'type' => 'neutral',
            'language' => 'en',
            'description' => 'Clear, young adult narrator.',
            'tone' => [
                'id' => $oldSample->id,
                'tone_id' => 32,
                'design_prompt' => 'Relaxed, measured and reassuring.',
                'reference_text' => 'This is the new reference phrase.',
            ],
        ])->assertOk()
            ->assertJsonPath('data.voice.samples.0.tone.id', 32)
            ->assertJsonPath('data.voice.samples.0.design_prompt', 'Relaxed, measured and reassuring.');

        Storage::disk('public')->assertMissing($oldSample->audio_path);
        $this->assertDatabaseCount('audio_library_voice_samples', 1);
    }
}
