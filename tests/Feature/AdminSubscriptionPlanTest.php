<?php

namespace Tests\Feature;

use App\Models\SubscriptionPlan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminSubscriptionPlanTest extends TestCase
{
    use RefreshDatabase;

    public function test_administrators_can_manage_the_three_monthly_subscription_plans(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $user = User::factory()->create(['role' => 'user']);

        $this->actingAs($user)->getJson('/dashboard/api/admin/subscription-plans')->assertForbidden();

        $this->actingAs($admin)->getJson('/dashboard/api/admin/subscription-plans')
            ->assertOk()
            ->assertJsonCount(3, 'data.plans')
            ->assertJsonPath('data.plans.0.plan_key', 'starter');

        $plan = SubscriptionPlan::query()->where('plan_key', 'creator')->firstOrFail();
        $this->actingAs($admin)->patchJson("/dashboard/api/admin/subscription-plans/{$plan->id}", [
            'name' => 'Creator Plus',
            'description' => 'More monthly AI capacity.',
            'monthly_price_cents' => 2400,
            'currency' => 'eur',
            'monthly_credits' => 20000,
            'is_active' => false,
        ])->assertOk()->assertJsonPath('data.plan.currency', 'EUR');

        $this->assertDatabaseHas('subscription_plans', ['id' => $plan->id, 'name' => 'Creator Plus', 'monthly_price_cents' => 2400, 'monthly_credits' => 20000, 'is_active' => false]);
    }
}
