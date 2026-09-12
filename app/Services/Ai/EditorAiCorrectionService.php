<?php

namespace App\Services\Ai;

use App\Models\AiProvider;
use App\Models\AiProviderCredential;
use App\Models\AiServiceSetting;
use App\Models\Book;
use App\Models\BookBlock;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class EditorAiCorrectionService
{
    public function generate(Book $book, BookBlock $block, string $type, ?string $providerKey = null, ?string $model = null, ?int $accountId = null): array
    {
        Log::debug('AI correction started.', [
            'book_id' => $book->id,
            'block_id' => $block->id,
            'block_uuid' => $block->block_uuid,
            'block_version_id' => $block->current_version_id,
            'review_type' => $type,
            'requested_provider' => $providerKey,
            'requested_model' => $model,
        ]);

        $provider = $this->resolveProvider($accountId ?? auth()->id(), $providerKey, $model, $book);
        $originalText = $block->currentVersion->text_plain ?? $block->text_plain ?? '';

        Log::debug('AI correction provider resolved.', [
            'book_id' => $book->id,
            'block_uuid' => $block->block_uuid,
            'provider_key' => $provider['provider_key'],
            'model' => $provider['model'],
            'text_length' => mb_strlen($originalText),
        ]);

        if ($provider['provider_key'] === 'mock') {
            return $this->mockCorrection($originalText, $provider, $type);
        }

        if ($provider['provider_key'] === 'openai') {
            return $this->openAiCorrection($originalText, $provider, $type);
        }

        if ($provider['provider_key'] === 'lm-studio') {
            return $this->lmStudioCorrection($originalText, $provider, $type);
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

        if ($resolvedProviderKey === 'lm-studio') {
            $models = $this->lmStudioModels();
            if ($models === null || ! $models) {
                Log::warning('AI correction could not load LM Studio models.', [
                    'book_id' => $book->id,
                    'model' => $resolvedModel,
                ]);
                $this->fail('provider_key', 'LM Studio is not reachable or has no language model available.');
            }

            $provider['models'] = $models;
            Log::debug('AI correction loaded LM Studio models.', [
                'book_id' => $book->id,
                'requested_model' => $resolvedModel,
                'available_models' => $models,
            ]);
        }

        if (! in_array($resolvedModel, $provider['models'], true)) {
            Log::warning('AI correction requested an unavailable model.', [
                'book_id' => $book->id,
                'provider_key' => $resolvedProviderKey,
                'requested_model' => $resolvedModel,
                'available_models' => $provider['models'],
            ]);
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
            'correction_instructions' => $setting?->options_json['correction_instructions'] ?? $this->defaultCorrectionInstructions(),
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

        $prompt = $this->correctionPrompt($originalText, $type, $provider['correction_instructions']);
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

    private function lmStudioCorrection(string $originalText, array $provider, string $type): array
    {
        $prompt = $this->correctionPrompt($originalText, $type, $provider['correction_instructions']);
        $baseUrl = rtrim($provider['base_url'] ?: 'http://127.0.0.1:1234/v1', '/');

        Log::debug('AI correction sending request to LM Studio.', [
            'provider_key' => $provider['provider_key'],
            'model' => $provider['model'],
            'endpoint' => "{$baseUrl}/chat/completions",
            'review_type' => $type,
            'text_length' => mb_strlen($originalText),
        ]);

        try {
            $response = Http::acceptJson()
                ->timeout(180)
                ->post("{$baseUrl}/chat/completions", [
                    'model' => $provider['model'],
                    'messages' => [
                        ['role' => 'system', 'content' => $provider['system_prompt']],
                        ['role' => 'user', 'content' => $prompt],
                    ],
                    'temperature' => 0.2,
                ]);
        } catch (\Throwable $exception) {
            Log::warning('AI correction could not reach LM Studio.', [
                'model' => $provider['model'],
                'endpoint' => "{$baseUrl}/chat/completions",
                'exception' => $exception->getMessage(),
            ]);
            $this->fail('provider_key', 'LM Studio is not reachable. Start its local server and load the selected model.');
        }

        if ($response->failed()) {
            Log::warning('AI correction received an LM Studio error response.', [
                'model' => $provider['model'],
                'endpoint' => "{$baseUrl}/chat/completions",
                'status' => $response->status(),
                'response_preview' => mb_substr($response->body(), 0, 500),
            ]);
            $this->fail('provider_key', 'LM Studio correction request failed: '.$response->body());
        }

        $suggestedText = trim((string) $response->json('choices.0.message.content'));
        if ($suggestedText === '') {
            Log::warning('AI correction received an empty LM Studio response.', [
                'model' => $provider['model'],
                'endpoint' => "{$baseUrl}/chat/completions",
                'response_id' => $response->json('id'),
            ]);
            $this->fail('provider_key', 'LM Studio returned an empty correction response.');
        }

        Log::debug('AI correction received an LM Studio response.', [
            'model' => $provider['model'],
            'endpoint' => "{$baseUrl}/chat/completions",
            'response_id' => $response->json('id'),
            'suggested_text_length' => mb_strlen($suggestedText),
        ]);

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
                'endpoint' => "{$baseUrl}/chat/completions",
                'changes_detected' => $originalText !== $suggestedText,
                'system_prompt' => $provider['system_prompt'],
                'prompt' => $prompt,
                'response_id' => $response->json('id'),
            ],
        ];
    }

    private function correctionPrompt(string $text, string $type, string $instructions): string
    {
        return "Correction type: {$type}\n\nEditorial instructions:\n{$instructions}\n\nOutput requirements (mandatory):\n- Return only the final corrected paragraph.\n- Do not add an introduction, conclusion, explanation, summary, note, label, quotation marks or Markdown.\n- Do not describe what you corrected and do not ask for more text.\n\nParagraph:\n{$text}";
    }

    private function lmStudioModels(): ?array
    {
        try {
            $response = Http::acceptJson()
                ->timeout(5)
                ->get('http://127.0.0.1:1234/api/v1/models');
        } catch (\Throwable $exception) {
            Log::debug('AI correction LM Studio model discovery failed.', [
                'endpoint' => 'http://127.0.0.1:1234/api/v1/models',
                'exception' => $exception->getMessage(),
            ]);

            return null;
        }

        if ($response->failed()) {
            Log::debug('AI correction LM Studio model discovery returned an error.', [
                'endpoint' => 'http://127.0.0.1:1234/api/v1/models',
                'status' => $response->status(),
            ]);

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

    private function defaultSystemPrompt(): string
    {
        return 'You are a professional book editor. Your entire response must consist only of the corrected text requested by the user. Never add commentary, explanations, summaries, labels, greetings, Markdown, quotation marks, or follow-up questions.';
    }

    private function defaultCorrectionInstructions(): string
    {
        return 'Revise the text for grammar, style, continuity and readability while preserving its meaning, voice and language.';
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
