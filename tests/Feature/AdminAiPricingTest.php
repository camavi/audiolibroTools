<?php

namespace Tests\Feature;

use App\Models\AiModelPrice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminAiPricingTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_an_administrator_can_manage_the_ai_price_catalog(): void
    {
        $user = User::factory()->create(['role' => 'user']);
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($user)->getJson('/dashboard/api/admin/ai-pricing')->assertForbidden();

        $this->actingAs($admin)->getJson('/dashboard/api/admin/ai-pricing')
            ->assertOk()
            ->assertJsonFragment(['provider_key' => 'at-qwen', 'model' => 'fast', 'modality' => 'audio']);
    }

    public function test_an_administrator_can_save_text_audio_and_image_model_prices(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin)->putJson('/dashboard/api/admin/ai-pricing', ['prices' => [
            ['provider_key' => 'at-openai', 'model' => 'gpt-5-mini', 'modality' => 'text', 'input_price_usd' => 0.25, 'output_price_usd' => 2],
            ['provider_key' => 'at-qwen', 'model' => 'quality', 'modality' => 'audio', 'unit_price_usd' => 0.03],
            ['provider_key' => 'at-openai', 'model' => 'gpt-image-1', 'modality' => 'image', 'unit_price_usd' => 0.04],
        ]])->assertOk();

        $this->assertDatabaseHas('ai_model_prices', ['provider_key' => 'at-openai', 'model' => 'gpt-5-mini', 'modality' => 'text', 'input_price_usd' => 0.25, 'output_price_usd' => 2]);
        $this->assertDatabaseHas('ai_model_prices', ['provider_key' => 'at-qwen', 'model' => 'quality', 'modality' => 'audio', 'unit_price_usd' => 0.03]);
        $this->assertDatabaseHas('ai_model_prices', ['provider_key' => 'at-openai', 'model' => 'gpt-image-1', 'modality' => 'image', 'unit_price_usd' => 0.04]);
    }

    public function test_an_administrator_can_disable_or_remove_a_catalog_model(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $model = ['provider_key' => 'at-openai', 'model' => 'gpt-5-mini', 'modality' => 'text'];

        $this->actingAs($admin)->patchJson('/dashboard/api/admin/ai-pricing/status', [...$model, 'action' => 'disable'])
            ->assertOk()
            ->assertJsonPath('data.prices.2.is_enabled', false);

        $this->assertDatabaseHas('ai_model_prices', [...$model, 'is_enabled' => false, 'is_hidden' => false]);

        $response = $this->actingAs($admin)->patchJson('/dashboard/api/admin/ai-pricing/status', [...$model, 'action' => 'delete'])
            ->assertOk();

        $this->assertFalse(collect($response->json('data.prices'))->contains(fn (array $price) => $price['provider_key'] === $model['provider_key'] && $price['model'] === $model['model'] && $price['modality'] === $model['modality']));

        $this->assertDatabaseHas('ai_model_prices', [...$model, 'is_hidden' => true]);
    }

    public function test_an_administrator_can_add_a_custom_priced_model(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin)->postJson('/dashboard/api/admin/ai-pricing', [
            'provider_key' => 'at-elevenlabs',
            'provider_name' => 'AT · ElevenLabs',
            'model' => 'multilingual-v2',
            'modality' => 'audio',
            'unit_price_usd' => 0.18,
        ])->assertCreated()
            ->assertJsonFragment(['provider_key' => 'at-elevenlabs', 'model' => 'multilingual-v2', 'modality' => 'audio']);

        $this->assertDatabaseHas('ai_model_prices', ['provider_key' => 'at-elevenlabs', 'provider_name' => 'AT · ElevenLabs', 'model' => 'multilingual-v2', 'modality' => 'audio', 'pricing_unit' => 'per_audio_minute']);
    }
}
