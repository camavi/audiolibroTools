<?php

namespace App\Http\Controllers;

use App\Models\AiProvider;
use App\Models\AiProviderCredential;
use App\Models\AiServiceSetting;
use App\Models\Book;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class DashboardAiController extends Controller
{
    public function providers(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'service' => ['nullable', 'string', 'max:60'],
            'key_book' => ['nullable', 'string', 'max:64'],
        ]);

        $accountId = auth()->id();
        $service = $validated['service'] ?? 'correction';
        $book = $this->bookFromKey($validated['key_book'] ?? null);
        $providers = $this->availableProviders($accountId);
        $setting = $this->serviceSetting($service, $accountId, $book, $providers);

        return response()->json([
            'data' => [
                'providers' => $providers,
                'setting' => $setting,
                'services' => $this->services(),
            ],
        ]);
    }

    public function storeProvider(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'base_url' => ['nullable', 'url', 'max:255'],
            'models' => ['required', 'array', 'min:1'],
            'models.*' => ['required', 'string', 'max:120'],
            'default_model' => ['nullable', 'string', 'max:120'],
            'api_key' => ['nullable', 'string', 'max:5000'],
        ]);

        $models = collect($validated['models'])
            ->map(fn (string $model) => trim($model))
            ->filter()
            ->unique()
            ->values();

        $provider = AiProvider::query()->create([
            'account_id' => auth()->id(),
            'provider_key' => 'custom-'.Str::slug($validated['name']).'-'.Str::lower(Str::random(6)),
            'name' => $validated['name'],
            'base_url' => $validated['base_url'] ?? null,
            'models_json' => $models->all(),
            'default_model' => $validated['default_model'] ?? $models->first(),
            'is_custom' => true,
            'is_active' => true,
        ]);

        $this->storeCredential(auth()->id(), $provider->provider_key, $validated['api_key'] ?? null);

        return response()->json([
            'data' => [
                'provider' => $this->serializeCustomProvider($provider, $this->credentialMap(auth()->id())),
            ],
        ], 201);
    }

    public function updateSetting(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'service' => ['required', 'string', 'max:60'],
            'key_book' => ['nullable', 'string', 'max:64'],
            'provider_key' => ['required', 'string', 'max:80'],
            'model' => ['required', 'string', 'max:120'],
            'api_key' => ['nullable', 'string', 'max:5000'],
            'system_prompt' => ['nullable', 'string', 'max:12000'],
        ]);

        $accountId = auth()->id();
        $book = $this->bookFromKey($validated['key_book'] ?? null);
        $providers = $this->availableProviders($accountId);
        $provider = collect($providers)->firstWhere('provider_key', $validated['provider_key']);

        abort_unless($provider, 422);
        abort_unless(in_array($validated['model'], $provider['models'], true), 422);

        $existingSetting = AiServiceSetting::query()
            ->where('account_id', $accountId)
            ->where('book_id', $book?->id)
            ->where('service', $validated['service'])
            ->first();
        $systemPrompt = array_key_exists('system_prompt', $validated)
            ? trim((string) ($validated['system_prompt'] ?? ''))
            : ($existingSetting?->options_json['system_prompt'] ?? $this->defaultSystemPrompt($validated['service']));

        $setting = AiServiceSetting::query()->updateOrCreate([
            'account_id' => $accountId,
            'book_id' => $book?->id,
            'service' => $validated['service'],
        ], [
            'ai_provider_id' => $provider['custom_id'] ?? null,
            'provider_key' => $provider['provider_key'],
            'model' => $validated['model'],
            'options_json' => [
                'provider_name' => $provider['name'],
                'base_url' => $provider['base_url'],
                'system_prompt' => $systemPrompt,
            ],
        ]);

        $this->storeCredential($accountId, $provider['provider_key'], $validated['api_key'] ?? null);

        return response()->json([
            'data' => [
                'setting' => $this->serializeSetting($setting),
            ],
        ]);
    }

    private function bookFromKey(?string $keyBook): ?Book
    {
        if (! $keyBook) {
            return null;
        }

        return Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();
    }

    private function availableProviders(?int $accountId): array
    {
        $credentials = $this->credentialMap($accountId);

        $defaults = collect(config('ai_providers.defaults', []))
            ->map(function (array $provider) use ($credentials) {
                $providerKey = $provider['provider_key'];

                return [
                    'provider_key' => $providerKey,
                    'name' => $provider['name'],
                    'base_url' => $provider['base_url'] ?? null,
                    'models' => $provider['models'] ?? [],
                    'default_model' => $provider['default_model'] ?? ($provider['models'][0] ?? null),
                    'is_custom' => false,
                    'custom_id' => null,
                    'has_api_key' => $credentials[$providerKey] ?? false,
                ];
            });

        $custom = AiProvider::query()
            ->where('account_id', $accountId)
            ->where('is_active', true)
            ->orderBy('name')
            ->get()
            ->map(fn (AiProvider $provider) => $this->serializeCustomProvider($provider, $credentials));

        return $defaults->merge($custom)->values()->all();
    }

    private function serviceSetting(string $service, ?int $accountId, ?Book $book, array $providers): array
    {
        $setting = AiServiceSetting::query()
            ->where('account_id', $accountId)
            ->where('book_id', $book?->id)
            ->where('service', $service)
            ->first();

        if ($setting) {
            return $this->serializeSetting($setting);
        }

        $defaultProvider = collect($providers)->firstWhere('provider_key', 'mock') ?? $providers[0] ?? null;

        return [
            'service' => $service,
            'provider_key' => $defaultProvider['provider_key'] ?? 'mock',
            'model' => $defaultProvider['default_model'] ?? 'mock-correction-v1',
            'system_prompt' => $this->defaultSystemPrompt($service),
        ];
    }

    private function serializeCustomProvider(AiProvider $provider, array $credentials = []): array
    {
        return [
            'provider_key' => $provider->provider_key,
            'name' => $provider->name,
            'base_url' => $provider->base_url,
            'models' => $provider->models_json ?? [],
            'default_model' => $provider->default_model,
            'is_custom' => $provider->is_custom,
            'custom_id' => $provider->id,
            'has_api_key' => $credentials[$provider->provider_key] ?? false,
        ];
    }

    private function serializeSetting(AiServiceSetting $setting): array
    {
        return [
            'service' => $setting->service,
            'provider_key' => $setting->provider_key,
            'model' => $setting->model,
            'system_prompt' => $setting->options_json['system_prompt'] ?? $this->defaultSystemPrompt($setting->service),
        ];
    }

    private function defaultSystemPrompt(string $service): string
    {
        return match ($service) {
            'correction', 'rewrite' => 'You are a professional book editor. Return only the corrected text, with no explanation.',
            'translate' => 'You are a literary translator. Preserve meaning, voice, rhythm and paragraph structure.',
            'chat' => 'You are an editorial assistant for this book. Use the selected context and answer clearly.',
            'comments' => 'You are an editorial reviewer. Write concise comments tied to the selected block.',
            'voices' => 'You are a voice casting assistant for an audiobook. Recommend voices based on characters and tone.',
            'audio' => 'You are an audiobook production assistant. Focus on narration, pacing and audio direction.',
            'versions' => 'You are an editorial history assistant. Compare versions and explain changes clearly.',
            default => 'You are an expert assistant for this book project.',
        };
    }

    private function services(): array
    {
        return [
            ['key' => 'chat', 'label' => 'AI Chat'],
            ['key' => 'comments', 'label' => 'Comments'],
            ['key' => 'correction', 'label' => 'Correct'],
            ['key' => 'rewrite', 'label' => 'Rewrite'],
            ['key' => 'voices', 'label' => 'Voices'],
            ['key' => 'audio', 'label' => 'Audio'],
            ['key' => 'translate', 'label' => 'Translate'],
            ['key' => 'versions', 'label' => 'Versions'],
        ];
    }

    private function credentialMap(?int $accountId): array
    {
        return AiProviderCredential::query()
            ->where('account_id', $accountId)
            ->get(['provider_key', 'api_key'])
            ->mapWithKeys(fn (AiProviderCredential $credential) => [
                $credential->provider_key => filled($credential->api_key),
            ])
            ->all();
    }

    private function storeCredential(?int $accountId, string $providerKey, ?string $apiKey): void
    {
        if (! filled($apiKey)) {
            return;
        }

        AiProviderCredential::query()->updateOrCreate([
            'account_id' => $accountId,
            'provider_key' => $providerKey,
        ], [
            'api_key' => $apiKey,
            'verified_at' => null,
        ]);
    }
}
