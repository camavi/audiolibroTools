<?php

namespace App\Services\Ai;

use App\Models\AiProvider;
use App\Models\AiProviderCredential;
use App\Models\AiServiceSetting;
use App\Models\Book;
use App\Models\BookBlock;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Http;

class EditorAiCorrectionService
{
    public function generate(Book $book, BookBlock $block, string $type, ?string $providerKey = null, ?string $model = null): array
    {
        $provider = $this->resolveProvider(auth()->id(), $providerKey, $model, $book);
        $originalText = $block->currentVersion->text_plain ?? $block->text_plain ?? '';

        if ($provider['provider_key'] === 'mock') {
            return $this->mockCorrection($originalText, $provider, $type);
        }

        if ($provider['provider_key'] === 'openai') {
            return $this->openAiCorrection($originalText, $provider, $type);
        }

        $this->fail('provider_key', "Provider [{$provider['provider_key']}] is configured but not implemented for corrections yet.");
    }

    private function resolveProvider(?int $accountId, ?string $providerKey, ?string $model, Book $book): array
    {
        $setting = AiServiceSetting::query()
            ->where('account_id', $accountId)
            ->where('book_id', $book->id)
            ->where('service', 'correction')
            ->first();

        if (! $setting) {
            $setting = AiServiceSetting::query()
                ->where('account_id', $accountId)
                ->whereNull('book_id')
                ->where('service', 'correction')
                ->first();
        }

        $resolvedProviderKey = $providerKey ?: ($setting?->provider_key ?: 'mock');
        $resolvedModel = $model ?: ($setting?->model ?: 'mock-correction-v1');
        $provider = $this->providerConfig($accountId, $resolvedProviderKey);

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
            'api_key' => $credential?->api_key,
            'system_prompt' => $setting?->options_json['system_prompt'] ?? $this->defaultSystemPrompt(),
        ];
    }

    private function providerConfig(?int $accountId, string $providerKey): array
    {
        $default = collect(config('ai_providers.defaults', []))
            ->firstWhere('provider_key', $providerKey);

        if ($default) {
            return [
                'provider_key' => $default['provider_key'],
                'name' => $default['name'],
                'base_url' => $default['base_url'] ?? null,
                'models' => $default['models'] ?? [],
                'is_custom' => false,
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
            'is_custom' => true,
        ];
    }

    private function mockCorrection(string $originalText, array $provider, string $type): array
    {
        $suggestedText = trim(preg_replace('/[ \t]+/u', ' ', $originalText) ?? $originalText);
        $suggestedText = preg_replace('/\s+([,.;:!?])/u', '$1', $suggestedText) ?? $suggestedText;
        $suggestedText = preg_replace('/([.!?])([^\s"”’])/u', '$1 $2', $suggestedText) ?? $suggestedText;

        return [
            'source' => 'mock-ai',
            'original_text' => $originalText,
            'suggested_text' => $suggestedText,
            'notes_json' => [
                'mode' => 'local-mock',
                'provider_key' => $provider['provider_key'],
                'provider_name' => $provider['name'],
                'model' => $provider['model'],
                'review_type' => $type,
                'system_prompt' => $provider['system_prompt'],
                'changes_detected' => $originalText !== $suggestedText,
                'message' => 'Local placeholder correction.',
            ],
        ];
    }

    private function openAiCorrection(string $originalText, array $provider, string $type): array
    {
        if (! filled($provider['api_key'])) {
            $this->fail('api_key', 'Save an API key before using OpenAI corrections.');
        }

        $prompt = $this->correctionPrompt($originalText, $type);
        $baseUrl = rtrim($provider['base_url'] ?: 'https://api.openai.com/v1', '/');
        $response = Http::withToken($provider['api_key'])
            ->acceptJson()
            ->timeout(45)
            ->post("{$baseUrl}/responses", [
                'model' => $provider['model'],
                'store' => false,
                'input' => [
                    [
                        'role' => 'system',
                        'content' => [
                            [
                                'type' => 'input_text',
                                'text' => $provider['system_prompt'],
                            ],
                        ],
                    ],
                    [
                        'role' => 'user',
                        'content' => [
                            [
                                'type' => 'input_text',
                                'text' => $prompt,
                            ],
                        ],
                    ],
                ],
            ]);

        if ($response->failed()) {
            $this->fail('provider_key', 'OpenAI correction request failed: '.$response->body());
        }

        $suggestedText = trim($this->extractResponseText($response->json()));

        if ($suggestedText === '') {
            $this->fail('provider_key', 'OpenAI returned an empty correction response.');
        }

        return [
            'source' => 'ai',
            'original_text' => $originalText,
            'suggested_text' => $suggestedText,
            'notes_json' => [
                'mode' => 'provider',
                'provider_key' => $provider['provider_key'],
                'provider_name' => $provider['name'],
                'model' => $provider['model'],
                'review_type' => $type,
                'endpoint' => "{$baseUrl}/responses",
                'changes_detected' => $originalText !== $suggestedText,
                'system_prompt' => $provider['system_prompt'],
                'prompt' => $prompt,
                'response_id' => $response->json('id'),
            ],
        ];
    }

    private function correctionPrompt(string $text, string $type): string
    {
        return "Correction type: {$type}\n\nEdit the following book paragraph for grammar, style, continuity and readability while preserving meaning, voice and language. Return only the corrected paragraph.\n\n{$text}";
    }

    private function defaultSystemPrompt(): string
    {
        return 'You are a professional book editor. Return only the corrected text, with no explanation.';
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
            'errors' => [
                $field => [$message],
            ],
        ], 422));
    }
}
