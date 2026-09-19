<?php

namespace App\Http\Controllers;

use App\Models\AiModelPrice;
use App\Models\SubscriptionPlan;
use App\Models\TokenPackage;
use App\Models\User;
use App\Services\AdminAuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class AdminAiPricingController extends Controller
{
    public function __construct(private readonly AdminAuditService $audit) {}

    public function index(): JsonResponse
    {
        $saved = AiModelPrice::query()->get()->keyBy(fn (AiModelPrice $price) => $this->key($price->provider_key, $price->model, $price->modality));
        $catalog = $this->catalog();
        $catalogKeys = $catalog->map(fn (array $item) => $this->key($item['provider_key'], $item['model'], $item['modality']))->flip();
        $custom = $saved->reject(fn (AiModelPrice $price) => $catalogKeys->has($this->key($price->provider_key, $price->model, $price->modality)))->map(fn (AiModelPrice $price) => [
            'provider_key' => $price->provider_key,
            'provider_name' => $price->provider_name ?: $price->provider_key,
            'model' => $price->model,
            'modality' => $price->modality,
            'pricing_unit' => $price->pricing_unit,
        ]);

        return response()->json(['data' => [
            'prices' => $catalog->concat($custom)->filter(function (array $item) use ($saved): bool {
                return ! (bool) $saved->get($this->key($item['provider_key'], $item['model'], $item['modality']))?->is_hidden;
            })->map(function (array $item) use ($saved): array {
                $price = $saved->get($this->key($item['provider_key'], $item['model'], $item['modality']));

                return [
                    ...$item,
                    'input_tokens' => $price?->input_tokens,
                    'output_tokens' => $price?->output_tokens,
                    'customer_credits' => $price?->customer_credits,
                    'is_configured' => $price !== null,
                    'is_enabled' => $price?->is_enabled ?? true,
                ];
            })->values(),
            'units' => [
                'text' => 'Per input/output token',
                'audio' => 'Per audio minute',
                'image' => 'Per generated image',
            ],
            'token_products' => [
                'plans' => SubscriptionPlan::query()->orderBy('sort_order')->get()->map(fn (SubscriptionPlan $plan) => [
                    'name' => $plan->name,
                    'price_cents' => $plan->monthly_price_cents,
                    'currency' => $plan->currency,
                    'credits' => $plan->monthly_credits,
                    'is_active' => $plan->is_active,
                ])->values(),
                'packages' => TokenPackage::query()->orderBy('sort_order')->get()->map(fn (TokenPackage $package) => [
                    'name' => $package->name,
                    'price_cents' => $package->price_cents,
                    'currency' => $package->currency,
                    'credits' => $package->credits,
                    'is_active' => $package->is_active,
                ])->values(),
            ],
        ]]);
    }

    public function update(Request $request): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $data = $request->validate([
            'prices' => ['required', 'array', 'min:1', 'max:100'],
            'prices.*.provider_key' => ['required', 'string', 'max:80'],
            'prices.*.model' => ['required', 'string', 'max:160'],
            'prices.*.modality' => ['required', 'in:text,audio,image'],
            'prices.*.input_tokens' => ['nullable', 'integer', 'min:1', 'max:100000000'],
            'prices.*.output_tokens' => ['nullable', 'integer', 'min:1', 'max:100000000'],
            'prices.*.customer_credits' => ['nullable', 'integer', 'min:1', 'max:100000000'],
        ]);

        $catalog = $this->catalog()->keyBy(fn (array $item) => $this->key($item['provider_key'], $item['model'], $item['modality']));
        foreach ($data['prices'] as $item) {
            $key = $this->key($item['provider_key'], $item['model'], $item['modality']);
            $existing = AiModelPrice::query()->where(['provider_key' => $item['provider_key'], 'model' => $item['model'], 'modality' => $item['modality']])->first();
            abort_unless($catalog->has($key) || $existing, 422, 'An unknown AI model cannot be priced.');

            $isText = $item['modality'] === 'text';
            abort_if($isText && (($item['input_tokens'] ?? null) === null || ($item['output_tokens'] ?? null) === null), 422, 'Text models need both input and output token charges.');

            AiModelPrice::query()->updateOrCreate(
                ['provider_key' => $item['provider_key'], 'model' => $item['model'], 'modality' => $item['modality']],
                [
                    'pricing_unit' => $catalog->get($key)['pricing_unit'] ?? $existing->pricing_unit,
                    'input_tokens' => $isText ? $item['input_tokens'] : null,
                    'output_tokens' => $isText ? $item['output_tokens'] : null,
                    'customer_credits' => $item['customer_credits'] ?? null,
                ],
            );
        }

        $this->audit->record($request, $actor, 'admin.ai_pricing_updated', ['models' => count($data['prices'])]);

        return $this->index();
    }

    public function updateStatus(Request $request): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $data = $request->validate([
            'provider_key' => ['required', 'string', 'max:80'],
            'model' => ['required', 'string', 'max:160'],
            'modality' => ['required', 'in:text,audio,image'],
            'action' => ['required', 'in:enable,disable,delete'],
        ]);

        $key = $this->key($data['provider_key'], $data['model'], $data['modality']);
        $catalog = $this->catalog()->keyBy(fn (array $item) => $this->key($item['provider_key'], $item['model'], $item['modality']));
        $existing = AiModelPrice::query()->where(['provider_key' => $data['provider_key'], 'model' => $data['model'], 'modality' => $data['modality']])->first();
        abort_unless($catalog->has($key) || $existing, 422, 'An unknown AI model cannot be changed.');

        $price = AiModelPrice::query()->firstOrNew([
            'provider_key' => $data['provider_key'],
            'model' => $data['model'],
            'modality' => $data['modality'],
        ]);
        $price->pricing_unit = $catalog->get($key)['pricing_unit'] ?? $existing?->pricing_unit;
        $price->is_enabled = $data['action'] !== 'disable';
        $price->is_hidden = $data['action'] === 'delete';
        $price->save();

        $this->audit->record($request, $actor, "admin.ai_pricing_{$data['action']}", ['provider_key' => $data['provider_key'], 'model' => $data['model'], 'modality' => $data['modality']]);

        return $this->index();
    }

    public function store(Request $request): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $data = $request->validate([
            'provider_key' => ['required', 'string', 'max:80', 'regex:/^[a-z0-9][a-z0-9_-]*$/'],
            'provider_name' => ['required', 'string', 'max:120'],
            'model' => ['required', 'string', 'max:160'],
            'modality' => ['required', 'in:text,audio,image'],
            'input_tokens' => ['nullable', 'integer', 'min:1', 'max:100000000'],
            'output_tokens' => ['nullable', 'integer', 'min:1', 'max:100000000'],
            'customer_credits' => ['nullable', 'integer', 'min:1', 'max:100000000'],
        ]);
        $isText = $data['modality'] === 'text';
        abort_if($isText && (($data['input_tokens'] ?? null) === null || ($data['output_tokens'] ?? null) === null), 422, 'Text models need both input and output token charges.');

        AiModelPrice::query()->updateOrCreate(
            ['provider_key' => $data['provider_key'], 'model' => $data['model'], 'modality' => $data['modality']],
            [
                'provider_name' => trim($data['provider_name']),
                'pricing_unit' => $this->unitFor($data['modality']),
                'input_tokens' => $isText ? $data['input_tokens'] : null,
                'output_tokens' => $isText ? $data['output_tokens'] : null,
                'customer_credits' => $data['customer_credits'] ?? null,
                'is_enabled' => true,
                'is_hidden' => false,
            ],
        );
        $this->audit->record($request, $actor, 'admin.ai_pricing_created', ['provider_key' => $data['provider_key'], 'model' => $data['model'], 'modality' => $data['modality']]);

        return response()->json($this->index()->getData(true), 201);
    }

    private function catalog(): Collection
    {
        $textModels = collect(config('ai_providers.defaults', []))->flatMap(fn (array $provider) => collect($provider['models'] ?? [])->map(fn (string $model) => [
            'provider_key' => $provider['provider_key'],
            'provider_name' => $provider['name'],
            'model' => $model,
            'modality' => 'text',
            'pricing_unit' => 'per_million_tokens',
        ]));

        return $textModels->concat([
            ['provider_key' => 'at-qwen', 'provider_name' => 'AT · Qwen TTS', 'model' => 'fast', 'modality' => 'audio', 'pricing_unit' => 'per_audio_minute'],
            ['provider_key' => 'at-qwen', 'provider_name' => 'AT · Qwen TTS', 'model' => (string) config('tts.qwen.model', 'quality'), 'modality' => 'audio', 'pricing_unit' => 'per_audio_minute'],
            ['provider_key' => 'at-openai', 'provider_name' => 'AT · OpenAI', 'model' => (string) config('ai_providers.image_model', 'gpt-image-1'), 'modality' => 'image', 'pricing_unit' => 'per_image'],
        ])->unique(fn (array $item) => $this->key($item['provider_key'], $item['model'], $item['modality']))->values();
    }

    private function key(string $provider, string $model, string $modality): string
    {
        return "{$provider}:{$model}:{$modality}";
    }

    private function unitFor(string $modality): string
    {
        return match ($modality) {
            'text' => 'per_million_tokens',
            'audio' => 'per_audio_minute',
            'image' => 'per_image',
        };
    }
}
