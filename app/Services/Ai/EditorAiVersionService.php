<?php

namespace App\Services\Ai;

use App\Models\AiProvider;
use App\Models\AiProviderCredential;
use App\Models\AiServiceSetting;
use App\Models\Book;
use App\Models\BookBlock;
use App\Models\BookBlockVersion;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Http;

class EditorAiVersionService
{
    public function explain(
        Book $book,
        BookBlock $block,
        BookBlockVersion $fromVersion,
        BookBlockVersion $toVersion,
        ?string $providerKey = null,
        ?string $model = null,
    ): array {
        $provider = $this->resolveProvider(auth()->id(), $book, $providerKey, $model);
        $prompt = $this->versionPrompt($block, $fromVersion, $toVersion);

        if ($provider['provider_key'] === 'mock') {
            return $this->mockExplanation($prompt, $fromVersion, $toVersion, $provider);
        }

        if ($provider['provider_key'] === 'openai') {
            return $this->openAiExplanation($prompt, $fromVersion, $toVersion, $provider);
        }

        $this->fail('provider_key', "Provider [{$provider['provider_key']}] is configured but not implemented for version explanations yet.");
    }

    private function resolveProvider(?int $accountId, Book $book, ?string $providerKey, ?string $model): array
    {
        $setting = AiServiceSetting::query()
            ->where('account_id', $accountId)
            ->where('book_id', $book->id)
            ->where('service', 'versions')
            ->first();

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

    private function mockExplanation(string $prompt, BookBlockVersion $fromVersion, BookBlockVersion $toVersion, array $provider): array
    {
        $fromWords = str_word_count($fromVersion->text_plain ?? '');
        $toWords = str_word_count($toVersion->text_plain ?? '');
        $direction = $toWords >= $fromWords ? 'expanded' : 'tightened';
        $answer = "Mock version summary: v{$fromVersion->version_number} -> v{$toVersion->version_number} {$direction} the selected block from {$fromWords} to {$toWords} words. Review the highlighted diff for exact wording changes before restoring or approving related audio and translation work.";

        return $this->responsePayload($answer, $prompt, $fromVersion, $toVersion, $provider, 'mock-ai');
    }

    private function openAiExplanation(string $prompt, BookBlockVersion $fromVersion, BookBlockVersion $toVersion, array $provider): array
    {
        if (! filled($provider['api_key'])) {
            $this->fail('api_key', 'Save an API key before using OpenAI version explanations.');
        }

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
            $this->fail('provider_key', 'OpenAI version explanation request failed: '.$response->body());
        }

        $answer = trim($this->extractResponseText($response->json()));

        if ($answer === '') {
            $this->fail('provider_key', 'OpenAI returned an empty version explanation.');
        }

        return $this->responsePayload($answer, $prompt, $fromVersion, $toVersion, $provider, 'ai', $response->json('id'), "{$baseUrl}/responses");
    }

    private function responsePayload(
        string $answer,
        string $prompt,
        BookBlockVersion $fromVersion,
        BookBlockVersion $toVersion,
        array $provider,
        string $source,
        ?string $responseId = null,
        ?string $endpoint = null,
    ): array {
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
                'message' => "Explain changes v{$fromVersion->version_number} -> v{$toVersion->version_number}",
                'from_version_id' => $fromVersion->id,
                'from_version_number' => $fromVersion->version_number,
                'to_version_id' => $toVersion->id,
                'to_version_number' => $toVersion->version_number,
                'system_prompt' => $provider['system_prompt'],
                'prompt' => $prompt,
                'endpoint' => $endpoint,
                'response_id' => $responseId,
            ],
        ];
    }

    private function versionPrompt(BookBlock $block, BookBlockVersion $fromVersion, BookBlockVersion $toVersion): string
    {
        return "Explain the editorial changes between two versions of the same book block.\n\nBlock UUID: {$block->block_uuid}\nFrom version: v{$fromVersion->version_number}\nTo version: v{$toVersion->version_number}\n\nPrevious text:\n{$fromVersion->text_plain}\n\nCurrent/target text:\n{$toVersion->text_plain}\n\nReturn a concise editorial summary with impact on meaning, style, continuity, audio, and translation.";
    }

    private function defaultSystemPrompt(): string
    {
        return 'You are an editorial history assistant. Compare versions and explain changes clearly.';
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
