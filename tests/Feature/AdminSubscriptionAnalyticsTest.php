<?php

namespace Tests\Feature;

use App\Models\AccountSubscription;
use App\Models\SubscriptionPlan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminSubscriptionAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_view_subscription_analytics(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $customer = User::factory()->create();
        $plan = SubscriptionPlan::query()->where('plan_key', 'creator')->firstOrFail();
        $this->subscription($customer, $plan, 'active');
        $this->subscription($customer, $plan, 'canceling');
        $this->subscription($customer, $plan, 'past_due');
        $cancelled = $this->subscription($customer, $plan, 'cancelled');
        $cancelled->update(['cancelled_at' => now()->subDay()]);

        $this->actingAs(User::factory()->create())->getJson('/dashboard/api/admin/billing/subscriptions')->assertForbidden();
        $this->actingAs($admin)->getJson('/dashboard/api/admin/billing/subscriptions?period=30')
            ->assertOk()
            ->assertJsonPath('data.summary.active_subscriptions', 2)
            ->assertJsonPath('data.summary.mrr_cents', 3800)
            ->assertJsonPath('data.summary.cancelled_subscriptions', 1)
            ->assertJsonPath('data.summary.past_due_subscriptions', 1)
            ->assertJsonPath('data.plans.0.plan_name', 'Creator');
    }

    private function subscription(User $user, SubscriptionPlan $plan, string $status): AccountSubscription
    {
        return AccountSubscription::query()->create([
            'user_id' => $user->id, 'subscription_plan_id' => $plan->id, 'provider' => 'stripe',
            'provider_subscription_id' => 'sub_test_' . uniqid(), 'status' => $status, 'plan_name' => 'Creator',
            'monthly_price_cents' => 1900, 'currency' => 'EUR', 'monthly_credits' => 15000,
            'current_period_starts_at' => now()->startOfMonth(), 'current_period_ends_at' => now()->addMonth(),
        ]);
    }
}
