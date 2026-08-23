<?php

namespace App\Http\Controllers;

use App\Models\AccountCreditBalance;
use App\Models\AccountCreditLedgerEntry;
use App\Models\AiProvider;
use App\Models\AiProviderCredential;
use App\Models\AiServiceSetting;
use App\Models\AudioLibraryVoice;
use App\Models\AudioMediaAsset;
use App\Models\Book;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rules\Password;

class ProfileController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $user = $this->user($request);

        return response()->json(['data' => [
            'user' => $this->serialize($user),
            'data_summary' => $this->dataSummary($user),
        ]]);
    }

    public function update(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
        ]);

        $user->fill([
            'name' => trim($data['name']),
        ])->save();

        return response()->json(['data' => ['user' => $this->serialize($user->fresh())]]);
    }

    public function updatePassword(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);

        if (! Hash::check($data['current_password'], $user->password)) {
            return response()->json([
                'message' => 'The current password is incorrect.',
                'errors' => ['current_password' => ['The current password is incorrect.']],
            ], 422);
        }

        $user->forceFill(['password' => Hash::make($data['password'])])->save();

        return response()->json(['data' => ['message' => 'Password updated.']]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'confirmation' => ['required', 'in:DELETE'],
        ]);

        if (! Hash::check($data['current_password'], $user->password)) {
            return response()->json([
                'message' => 'The current password is incorrect.',
                'errors' => ['current_password' => ['The current password is incorrect.']],
            ], 422);
        }

        $accountId = $user->getKey();
        $bookKeys = $accountId ? Book::query()->where('account_id', $accountId)->pluck('key_book')->all() : [];
        $voicePaths = AudioLibraryVoice::query()
            ->where('account_id', $accountId)
            ->with('samples:id,audio_library_voice_id,audio_path')
            ->get()
            ->flatMap(fn (AudioLibraryVoice $voice) => $voice->samples->pluck('audio_path'))
            ->filter()
            ->values()
            ->all();
        $mediaPaths = AudioMediaAsset::query()->where('account_id', $accountId)->pluck('audio_path')->filter()->values()->all();

        DB::transaction(function () use ($accountId): void {
            Book::query()->where('account_id', $accountId)->get()->each->delete();
            AudioLibraryVoice::query()->where('account_id', $accountId)->delete();
            AudioMediaAsset::query()->where('account_id', $accountId)->delete();
            AiProvider::query()->where('account_id', $accountId)->delete();
            AiProviderCredential::query()->where('account_id', $accountId)->delete();
            AiServiceSetting::query()->where('account_id', $accountId)->delete();
            AccountCreditBalance::query()->where('account_id', $accountId)->delete();
            AccountCreditLedgerEntry::query()->where('account_id', $accountId)->delete();
            User::query()->whereKey($accountId)->delete();
        });

        foreach ($bookKeys as $keyBook) {
            foreach (['audiobooks', 'book-designs', 'book-epubs', 'book-pdfs'] as $directory) {
                Storage::disk('public')->deleteDirectory("{$directory}/{$keyBook}");
            }
        }
        Storage::disk('public')->delete(array_filter([...$voicePaths, ...$mediaPaths]));
        Storage::disk('public')->deleteDirectory("audio-media/{$accountId}");
        Storage::disk('local')->deleteDirectory("bookEdit/{$accountId}");

        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['data' => ['redirect' => '/']]);
    }

    private function user(Request $request): User
    {
        /** @var User|null $user */
        $user = $request->user();
        abort_unless($user, 401, 'Please sign in to manage your profile.');

        return $user;
    }

    private function serialize(User $user): array
    {
        return $user->only('id', 'name', 'email', 'role') + ['created_at' => $user->created_at?->toISOString()];
    }

    private function dataSummary(User $user): array
    {
        return [
            'books' => Book::query()->where('account_id', $user->id)->count(),
            'voices' => AudioLibraryVoice::query()->where('account_id', $user->id)->count(),
            'audio_media' => AudioMediaAsset::query()->where('account_id', $user->id)->count(),
            'ai_connections' => AiProviderCredential::query()->where('account_id', $user->id)->count(),
        ];
    }
}
