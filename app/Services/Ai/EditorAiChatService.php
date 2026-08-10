<?php

namespace App\Services\Ai;

use App\Models\AiProvider;
use App\Models\AiProviderCredential;
use App\Models\AiServiceSetting;
use App\Models\Book;
use App\Models\BookBlock;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Http;

class EditorAiChatService
{
    public function ask(Book $book, array $payload): array
    {
        $provider = $this->resolveProvider(auth()->id(), $book, $payload['provider_key'] ?? null, $payload['model'] ?? null);
        $context = $this->contextText($book, $payload['scope'] ?? 'block', $payload['block_uuid'] ?? null);
        $message = trim($payload['message']);

        if ($provider['provider_key'] === 'mock') {
            return $this->mockAnswer($message, $context, $provider);
        }

        if ($provider['provider_key'] === 'openai') {
            return $this->openAiAnswer($message, $context, $provider);
        }

        $this->fail('provider_key', "Provider [{$provider['provider_key']}] is configured but not implemented for AI Chat yet.");
    }

    private function resolveProvider(?int $accountId, Book $book, ?string $providerKey, ?string $model): array
    {
        $setting = AiServiceSetting::query()
            ->where('account_id', $accountId)
            ->where('book_id', $book->id)
            ->where('service', 'chat')
            ->first();

        if (! $setting) {
            $setting = AiServiceSetting::query()
                ->where('account_id', $accountId)
                ->whereNull('book_id')
                ->where('service', 'chat')
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

    private function contextText(Book $book, string $scope, ?string $blockUuid): string
    {
        if ($scope === 'book') {
            return $book->blocks()
                ->where('status', '!=', 'deleted')
                ->orderBy('sort_order')
                ->limit(80)
                ->pluck('text_plain')
                ->filter()
                ->implode("\n\n");
        }

        if ($blockUuid) {
            $block = $book->blocks()
                ->with('currentVersion')
                ->where('block_uuid', $blockUuid)
                ->first();

            if ($block) {
                return $block->currentVersion->text_plain ?? $block->text_plain ?? '';
            }
        }

        /** @var BookBlock|null $firstBlock */
        $firstBlock = $book->blocks()
            ->where('status', '!=', 'deleted')
            ->orderBy('sort_order')
            ->first();

        return $firstBlock?->text_plain ?? '';
    }

    private function mockAnswer(string $message, string $context, array $provider): array
    {
        $preview = trim(mb_substr($context, 0, 220));
        $answer = $preview
            ? "Mock AI answer for: {$message}\n\nSelected context: {$preview}"
            : "Mock AI answer for: {$message}";

        return $this->responsePayload($answer, $message, $context, $provider, 'mock-ai', null);
    }

    private function openAiAnswer(string $message, string $context, array $provider): array
    {
        if (! filled($provider['api_key'])) {
            $this->fail('api_key', 'Save an API key before using OpenAI AI Chat.');
        }

        $baseUrl = rtrim($provider['base_url'] ?: 'https://api.openai.com/v1', '/');
        $userText = "Book context:\n{$context}\n\nUser question:\n{$message}";
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
                                'text' => $userText,
                            ],
                        ],
                    ],
                ],
            ]);

        if ($response->failed()) {
            $this->fail('provider_key', 'OpenAI AI Chat request failed: '.$response->body());
        }

        $answer = trim($this->extractResponseText($response->json()));

        if ($answer === '') {
            $this->fail('provider_key', 'OpenAI returned an empty AI Chat response.');
        }

        return $this->responsePayload($answer, $message, $context, $provider, 'ai', $response->json('id'), "{$baseUrl}/responses");
    }

    private function responsePayload(string $answer, string $message, string $context, array $provider, string $source, ?string $responseId, ?string $endpoint = null): array
    {
        return [
            'answer' => $answer,
            'source' => $source,
            'provider_key' => $provider['provider_key'],
            'provider_name' => $provider['name'],
            'model' => $provider['model'],
            'metadata' => [
                'provider_key' => $provider['provider_key'],
                'provider_name' => $provider['name'],
                'model' => $provider['model'],
                'source' => $source,
                'system_prompt' => $provider['system_prompt'],
                'message' => $message,
                'context_preview' => mb_substr($context, 0, 500),
                'endpoint' => $endpoint,
                'response_id' => $responseId,
            ],
        ];
    }

    private function defaultSystemPrompt(): string
    {
        return 'You are an editorial assistant for this book. Use the selected context and answer clearly.';
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
