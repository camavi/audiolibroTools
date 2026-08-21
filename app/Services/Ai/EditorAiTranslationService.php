<?php

namespace App\Services\Ai;

use App\Models\AiProvider;
use App\Models\AiProviderCredential;
use App\Models\AiServiceSetting;
use App\Models\Book;
use App\Models\BookBlock;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Http;

class EditorAiTranslationService
{
    public function generate(Book $book, BookBlock $block, string $targetLocale, ?string $providerKey = null, ?string $model = null, ?int $accountId = null): array
    {
        $provider = $this->resolveProvider($accountId ?? auth()->id(), $book, $providerKey, $model);
        $sourceText = $block->currentVersion->text_plain ?? $block->text_plain ?? '';
        $terms = $book->translationTerms()
            ->where('target_locale', strtolower($targetLocale))
            ->orderBy('source_term')
            ->get(['source_term', 'target_term', 'notes']);

        if ($provider['provider_key'] === 'mock') {
            return [
                'source' => 'mock',
                'translated_text' => "[{$targetLocale}] {$sourceText}",
                'notes_json' => [
                    'mock' => true,
                    'provider_key' => $provider['provider_key'],
                    'provider_name' => $provider['name'],
                    'model' => $provider['model'],
                    'glossary_terms_count' => $terms->count(),
                ],
            ];
        }

        if ($provider['provider_key'] === 'lm-studio') {
            return $this->lmStudioTranslation($provider, $sourceText, $book->lang, $targetLocale, $terms->all());
        }

        if ($provider['api_provider'] !== 'openai') {
            $this->fail('provider_key', "Provider [{$provider['provider_key']}] is configured but not implemented for translations yet.");
        }

        if (! filled($provider['api_key'])) {
            $this->fail('api_key', "{$provider['name']} is not configured for translations yet.");
        }

        $baseUrl = rtrim($provider['base_url'] ?: 'https://api.openai.com/v1', '/');
        $prompt = $this->translationPrompt($sourceText, $book->lang, $targetLocale, $terms->all());
        $response = Http::withToken($provider['api_key'])
            ->acceptJson()
            ->timeout(60)
            ->post("{$baseUrl}/responses", [
                'model' => $provider['model'],
                'store' => false,
                'input' => [
                    [
                        'role' => 'system',
                        'content' => [[
                            'type' => 'input_text',
                            'text' => $provider['system_prompt'],
                        ]],
                    ],
                    [
                        'role' => 'user',
                        'content' => [[
                            'type' => 'input_text',
                            'text' => $prompt,
                        ]],
                    ],
                ],
            ]);

        if ($response->failed()) {
            $this->fail('provider_key', 'OpenAI translation request failed: '.$response->body());
        }

        $translatedText = trim($this->extractResponseText($response->json()));
        if ($translatedText === '') {
            $this->fail('provider_key', 'OpenAI returned an empty translation response.');
        }

        return [
            'source' => 'ai',
            'translated_text' => $translatedText,
            'notes_json' => [
                'provider_key' => $provider['provider_key'],
                'provider_name' => $provider['name'],
                'model' => $provider['model'],
                'endpoint' => "{$baseUrl}/responses",
                'response_id' => $response->json('id'),
                'glossary_terms_count' => $terms->count(),
            ],
        ];
    }

    private function resolveProvider(?int $accountId, Book $book, ?string $providerKey, ?string $model): array
    {
        $setting = AiServiceSetting::query()
            ->where('account_id', $accountId)
            ->where('book_id', $book->id)
            ->where('service', 'translate')
            ->first()
            ?: AiServiceSetting::query()
                ->where('account_id', $accountId)
                ->whereNull('book_id')
                ->where('service', 'translate')
                ->first();

        $resolvedProviderKey = $providerKey ?: ($setting?->provider_key ?: 'mock');
        $resolvedModel = $model ?: ($setting?->model ?: 'mock-translation-v1');
        $provider = $this->providerConfig($accountId, $resolvedProviderKey);

        if ($resolvedProviderKey === 'lm-studio') {
            $models = $this->lmStudioModels();
            if ($models === null || ! $models) {
                $this->fail('provider_key', 'LM Studio is not reachable or has no language model available.');
            }
            $provider['models'] = $models;
        }

        if (! in_array($resolvedModel, $provider['models'], true)) {
            $this->fail('model', "Model [{$resolvedModel}] is not available for provider [{$resolvedProviderKey}].");
        }

        $credential = AiProviderCredential::query()
            ->where('account_id', $accountId)
            ->where('provider_key', $resolvedProviderKey)
            ->first();

        return [
            ...$provider,
            'model' => $resolvedModel,
            'api_key' => $provider['connection_mode'] === 'managed'
                ? ($provider['managed_api_key'] ?? null)
                : $credential?->api_key,
            'system_prompt' => $setting?->options_json['system_prompt'] ?? 'You are a literary translator. Return only the translated text, with no notes or markdown.',
        ];
    }

    private function providerConfig(?int $accountId, string $providerKey): array
    {
        $default = collect(config('ai_providers.defaults', []))->firstWhere('provider_key', $providerKey);
        if ($default) {
            return [
                'provider_key' => $default['provider_key'],
                'name' => $default['name'],
                'base_url' => $default['base_url'] ?? null,
                'models' => $default['models'] ?? [],
                'connection_mode' => $default['connection_mode'] ?? 'byok',
                'api_provider' => $default['api_provider'] ?? $default['provider_key'],
                'managed_api_key' => $default['managed_api_key'] ?? null,
            ];
        }

        $custom = AiProvider::query()
            ->where('account_id', $accountId)
            ->where('provider_key', $providerKey)
            ->where('is_active', true)
            ->first();

        if (! $custom) {
            $this->fail('provider_key', "Provider [{$providerKey}] is not available.");
        }

        return [
            'provider_key' => $custom->provider_key,
            'name' => $custom->name,
            'base_url' => $custom->base_url,
            'models' => $custom->models_json ?? [],
            'connection_mode' => 'local',
            'api_provider' => 'custom',
            'managed_api_key' => null,
        ];
    }

    private function translationPrompt(string $sourceText, ?string $sourceLocale, string $targetLocale, array $terms): string
    {
        $glossary = collect($terms)
            ->map(function ($term) {
                $note = filled($term->notes) ? " ({$term->notes})" : '';

                return "- {$term->source_term} → {$term->target_term}{$note}";
            })
            ->implode("\n");

        return 'Translate the following literary text from '.($sourceLocale ?: 'the source language')." to {$targetLocale}. Preserve meaning, voice, rhythm, paragraph structure, punctuation and dialogue. Return only the translation.\n\n"
            .($glossary ? "Required glossary:\n{$glossary}\n\n" : '')
            ."Text to translate:\n{$sourceText}";
    }

    private function lmStudioTranslation(array $provider, string $sourceText, ?string $sourceLocale, string $targetLocale, array $terms): array
    {
        $baseUrl = rtrim($provider['base_url'] ?: 'http://127.0.0.1:1234/v1', '/');
        try {
            $response = Http::acceptJson()
                ->timeout(180)
                ->post("{$baseUrl}/chat/completions", [
                    'model' => $provider['model'],
                    'messages' => [
                        ['role' => 'system', 'content' => $provider['system_prompt']],
                        ['role' => 'user', 'content' => $this->translationPrompt($sourceText, $sourceLocale, $targetLocale, $terms)],
                    ],
                    'temperature' => 0.2,
                ]);
        } catch (\Throwable) {
            $this->fail('provider_key', 'LM Studio is not reachable. Start its local server and load the selected model.');
        }

        if ($response->failed()) {
            $this->fail('provider_key', 'LM Studio translation request failed: '.$response->body());
        }

        $translatedText = trim((string) $response->json('choices.0.message.content'));
        if ($translatedText === '') {
            $this->fail('provider_key', 'LM Studio returned an empty translation response.');
        }

        return [
            'source' => 'ai',
            'translated_text' => $translatedText,
            'notes_json' => [
                'provider_key' => $provider['provider_key'],
                'provider_name' => $provider['name'],
                'model' => $provider['model'],
                'endpoint' => "{$baseUrl}/chat/completions",
                'response_id' => $response->json('id'),
                'glossary_terms_count' => count($terms),
            ],
        ];
    }

    private function lmStudioModels(): ?array
    {
        try {
            $response = Http::acceptJson()
                ->timeout(5)
                ->get('http://127.0.0.1:1234/api/v1/models');
        } catch (\Throwable) {
            return null;
        }

        if ($response->failed()) {
            return null;
        }

        return collect($response->json('models', []))
            ->filter(fn (array $model) => ($model['type'] ?? 'llm') === 'llm')
            ->map(fn (array $model) => $model['key'] ?? null)
            ->filter(fn ($model) => is_string($model) && $model !== '')
            ->unique()
            ->values()
            ->all();
    }

    private function extractResponseText(array $payload): string
    {
        if (isset($payload['output_text']) && is_string($payload['output_text'])) {
            return $payload['output_text'];
        }

        return collect($payload['output'] ?? [])
            ->flatMap(fn (array $item) => $item['content'] ?? [])
            ->map(fn (array $content) => $content['text'] ?? '')
            ->filter()
            ->implode("\n");
    }

    private function fail(string $field, string $message): never
    {
        throw new HttpResponseException(response()->json([
            'message' => $message,
            'errors' => [$field => [$message]],
        ], 422));
    }
}
