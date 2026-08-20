<?php

namespace Tests\Feature;

use App\Models\AiProviderCredential;
use App\Models\AudioLibraryVoice;
use App\Models\AudioLibraryVoiceSample;
use App\Models\AudioMediaAsset;
use App\Models\Book;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_update_profile_and_password(): void
    {
        $user = User::factory()->create(['password' => Hash::make('old-password')]);

        $this->actingAs($user)->patchJson('/dashboard/api/profile', ['name' => 'New name', 'email' => 'new@example.test'])
            ->assertOk()->assertJsonPath('data.user.name', 'New name');
        $this->assertSame($user->email, $user->fresh()->email);
        $this->actingAs($user)->putJson('/dashboard/api/profile/password', ['current_password' => 'old-password', 'password' => 'new-password', 'password_confirmation' => 'new-password'])
            ->assertOk();

        $this->assertTrue(Hash::check('new-password', $user->fresh()->password));
    }

    public function test_account_deletion_removes_workspace_records_and_files(): void
    {
        Storage::fake('public'); Storage::fake('local');
        $user = User::factory()->create(['password' => Hash::make('secret-password')]);
        $book = Book::query()->create([
            'account_id' => $user->id,
            'key_book' => 'profile-test-book-'.$user->id,
            'name' => 'Profile test book',
        ]);
        $voice = AudioLibraryVoice::query()->create(['account_id' => $user->id, 'name' => 'Voice', 'type' => 'female', 'language' => 'en']);
        AudioLibraryVoiceSample::query()->create(['audio_library_voice_id' => $voice->id, 'tone' => 'neutral', 'audio_path' => "audio-library/{$voice->id}/voice.wav"]);
        AudioMediaAsset::query()->create(['account_id' => $user->id, 'kind' => 'music', 'name' => 'Music', 'audio_path' => "audio-media/{$user->id}/music.mp3"]);
        AiProviderCredential::query()->create(['account_id' => $user->id, 'provider_key' => 'test', 'api_key' => 'encrypted']);
        Storage::disk('public')->put("audiobooks/{$book->key_book}/segments/test.wav", 'audio');
        Storage::disk('public')->put("audio-library/{$voice->id}/voice.wav", 'voice');
        Storage::disk('public')->put("audio-media/{$user->id}/music.mp3", 'music');
        Storage::disk('local')->put("bookEdit/{$user->id}/{$book->key_book}.json", '{}');

        $this->actingAs($user)->deleteJson('/dashboard/api/profile', ['current_password' => 'secret-password', 'confirmation' => 'DELETE'])
            ->assertOk()->assertJsonPath('data.redirect', '/');

        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        $this->assertDatabaseMissing('books', ['id' => $book->id]);
        $this->assertDatabaseMissing('audio_library_voices', ['id' => $voice->id]);
        $this->assertDatabaseCount('ai_provider_credentials', 0);
        Storage::disk('public')->assertMissing("audiobooks/{$book->key_book}/segments/test.wav");
        Storage::disk('public')->assertMissing("audio-library/{$voice->id}/voice.wav");
        Storage::disk('local')->assertMissing("bookEdit/{$user->id}/{$book->key_book}.json");
    }
}
