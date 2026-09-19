<?php

namespace Tests\Feature;

use App\Models\AccountSubscription;
use App\Models\SubscriptionPlan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminBillingAlertsTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_view_billing_alerts(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $customer = User::factory()->create();
        $plan = SubscriptionPlan::query()->where('plan_key', 'starter')->firstOrFail();
        AccountSubscription::query()->create([
            'user_id' => $customer->id, 'subscription_plan_id' => $plan->id, 'provider' => 'stripe',
            'provider_subscription_id' => 'sub_alert_test', 'status' => 'past_due', 'plan_name' => 'Starter',
            'monthly_price_cents' => 900, 'currency' => 'EUR', 'monthly_credits' => 5000,
            'current_period_starts_at' => now()->subMonth(), 'current_period_ends_at' => now()->addDays(3),
        ]);

        $this->actingAs(User::factory()->create())->getJson('/dashboard/api/admin/billing/alerts')->assertForbidden();
        $this->actingAs($admin)->getJson('/dashboard/api/admin/billing/alerts')
            ->assertOk()
            ->assertJsonPath('data.summary.critical_alerts', 1)
            ->assertJsonPath('data.alerts.0.title', 'Subscription payment overdue');
    }
}
