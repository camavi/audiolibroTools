<?php

namespace Tests\Feature;

use App\Models\AccountCreditLedgerEntry;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Services\Payments\SubscriptionLifecycleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SubscriptionLifecycleTest extends TestCase
{
    use RefreshDatabase;

    public function test_subscription_period_grant_is_idempotent_and_visible_to_the_customer(): void
    {
        $user = User::factory()->create();
        $plan = SubscriptionPlan::query()->where('plan_key', 'starter')->firstOrFail();
        $service = app(SubscriptionLifecycleService::class);
        $subscription = $service->activate($user, $plan, 'sub_test_123', now()->startOfDay(), now()->addMonth()->startOfDay());
        $service->grantPeriod($subscription);

        $this->assertDatabaseHas('account_credit_balances', ['account_id' => $user->id, 'available_credits' => $plan->monthly_credits]);
        $this->assertSame(1, AccountCreditLedgerEntry::query()->where('account_id', $user->id)->where('type', 'subscription_grant')->count());
        $this->actingAs($user)->getJson('/dashboard/api/subscription')->assertOk()->assertJsonPath('data.subscription.plan_name', 'Starter')->assertJsonPath('data.checkout_ready', false)->assertJsonCount(3, 'data.plans')->assertJsonCount(1, 'data.subscription.grants');
    }
}
