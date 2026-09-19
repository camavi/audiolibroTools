<?php

namespace Tests\Feature;

use App\Models\AccountCreditBalance;
use App\Models\AccountSubscription;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Services\Payments\StripeCheckoutService;
use App\Services\Payments\SubscriptionLifecycleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

class StripeSubscriptionCheckoutTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_can_start_checkout_for_a_stripe_ready_plan(): void
    {
        $user = User::factory()->create();
        $plan = SubscriptionPlan::query()->where('plan_key', 'starter')->firstOrFail();
        $plan->update(['stripe_price_id' => 'price_test_starter']);
        $stripe = Mockery::mock(StripeCheckoutService::class);
        $stripe->shouldReceive('createSubscriptionCheckout')->once()->andReturn(['id' => 'cs_test_subscription', 'url' => 'https://checkout.stripe.test/subscription']);
        $this->app->instance(StripeCheckoutService::class, $stripe);

        $this->actingAs($user)->postJson('/dashboard/api/subscription/checkout', ['subscription_plan_id' => $plan->id])
            ->assertCreated()->assertJsonPath('data.checkout_url', 'https://checkout.stripe.test/subscription');
    }

    public function test_stripe_subscription_sync_grants_the_period_once(): void
    {
        $user = User::factory()->create();
        $plan = SubscriptionPlan::query()->where('plan_key', 'starter')->firstOrFail();
        $payload = (object) ['id' => 'sub_test_sync', 'status' => 'active', 'cancel_at_period_end' => false, 'current_period_start' => now()->startOfDay()->timestamp, 'current_period_end' => now()->addMonth()->startOfDay()->timestamp];
        $service = app(SubscriptionLifecycleService::class);
        $service->syncStripeSubscription($user, $plan, $payload);
        $service->syncStripeSubscription($user, $plan, $payload);

        $this->assertDatabaseHas('account_credit_balances', ['account_id' => $user->id, 'available_credits' => $plan->monthly_credits]);
        $this->assertSame(1, AccountCreditBalance::query()->where('account_id', $user->id)->count());
    }

    public function test_customer_can_change_plan_and_schedule_or_reverse_cancellation(): void
    {
        $user = User::factory()->create();
        $starter = SubscriptionPlan::query()->where('plan_key', 'starter')->firstOrFail();
        $creator = SubscriptionPlan::query()->where('plan_key', 'creator')->firstOrFail();
        $creator->update(['stripe_price_id' => 'price_test_creator']);
        $subscription = AccountSubscription::query()->create([
            'user_id' => $user->id, 'subscription_plan_id' => $starter->id, 'provider' => 'stripe', 'provider_subscription_id' => 'sub_manage_test', 'provider_customer_id' => 'cus_manage_test',
            'status' => 'active', 'plan_name' => $starter->name, 'monthly_price_cents' => $starter->monthly_price_cents, 'currency' => $starter->currency, 'monthly_credits' => $starter->monthly_credits,
            'current_period_starts_at' => now()->startOfDay(), 'current_period_ends_at' => now()->addMonth()->startOfDay(),
        ]);
        $stripe = Mockery::mock(StripeCheckoutService::class);
        $stripe->shouldReceive('changeSubscriptionPlan')->once()->andReturn((object) ['id' => 'sub_manage_test', 'customer' => 'cus_manage_test', 'status' => 'active', 'cancel_at_period_end' => false, 'current_period_start' => now()->startOfDay()->timestamp, 'current_period_end' => now()->addMonth()->startOfDay()->timestamp]);
        $stripe->shouldReceive('setSubscriptionCancellation')->twice()->andReturn(
            (object) ['id' => 'sub_manage_test', 'customer' => 'cus_manage_test', 'status' => 'active', 'cancel_at_period_end' => true, 'current_period_start' => now()->startOfDay()->timestamp, 'current_period_end' => now()->addMonth()->startOfDay()->timestamp],
            (object) ['id' => 'sub_manage_test', 'customer' => 'cus_manage_test', 'status' => 'active', 'cancel_at_period_end' => false, 'current_period_start' => now()->startOfDay()->timestamp, 'current_period_end' => now()->addMonth()->startOfDay()->timestamp],
        );
        $this->app->instance(StripeCheckoutService::class, $stripe);

        $this->actingAs($user)->patchJson('/dashboard/api/subscription/plan', ['subscription_plan_id' => $creator->id, 'proration_date' => now()->timestamp])
            ->assertOk()->assertJsonPath('data.subscription.plan_name', 'Creator');
        $this->actingAs($user)->patchJson('/dashboard/api/subscription/cancellation', ['cancel_at_period_end' => true])
            ->assertOk()->assertJsonPath('data.subscription.cancel_at_period_end', true);
        $this->actingAs($user)->patchJson('/dashboard/api/subscription/cancellation', ['cancel_at_period_end' => false])
            ->assertOk()->assertJsonPath('data.subscription.cancel_at_period_end', false);

        $this->assertDatabaseHas('account_subscriptions', ['id' => $subscription->id, 'subscription_plan_id' => $creator->id, 'status' => 'active', 'cancel_at_period_end' => false]);
    }

    public function test_customer_can_preview_the_exact_plan_change_amount_before_confirming(): void
    {
        $user = User::factory()->create();
        $starter = SubscriptionPlan::query()->where('plan_key', 'starter')->firstOrFail();
        $creator = SubscriptionPlan::query()->where('plan_key', 'creator')->firstOrFail();
        $creator->update(['stripe_price_id' => 'price_test_creator']);
        AccountSubscription::query()->create([
            'user_id' => $user->id, 'subscription_plan_id' => $starter->id, 'provider' => 'stripe', 'provider_subscription_id' => 'sub_preview_test', 'status' => 'active', 'plan_name' => $starter->name, 'monthly_price_cents' => $starter->monthly_price_cents, 'currency' => $starter->currency, 'monthly_credits' => $starter->monthly_credits,
            'current_period_starts_at' => now()->startOfDay(), 'current_period_ends_at' => now()->addMonth()->startOfDay(),
        ]);
        $stripe = Mockery::mock(StripeCheckoutService::class);
        $stripe->shouldReceive('previewSubscriptionPlanChange')->once()->andReturn(['amount_due' => 1000, 'currency' => 'EUR', 'proration_date' => now()->timestamp]);
        $this->app->instance(StripeCheckoutService::class, $stripe);

        $this->actingAs($user)->postJson('/dashboard/api/subscription/plan-preview', ['subscription_plan_id' => $creator->id])
            ->assertOk()->assertJsonPath('data.preview.amount_due', 1000)->assertJsonPath('data.preview.currency', 'EUR');
    }

    public function test_customer_can_open_the_stripe_billing_portal(): void
    {
        $user = User::factory()->create();
        $plan = SubscriptionPlan::query()->where('plan_key', 'starter')->firstOrFail();
        AccountSubscription::query()->create([
            'user_id' => $user->id, 'subscription_plan_id' => $plan->id, 'provider' => 'stripe', 'provider_subscription_id' => 'sub_portal_test', 'provider_customer_id' => 'cus_portal_test',
            'status' => 'active', 'plan_name' => $plan->name, 'monthly_price_cents' => $plan->monthly_price_cents, 'currency' => $plan->currency, 'monthly_credits' => $plan->monthly_credits,
            'current_period_starts_at' => now()->startOfDay(), 'current_period_ends_at' => now()->addMonth()->startOfDay(),
        ]);
        $stripe = Mockery::mock(StripeCheckoutService::class);
        $stripe->shouldReceive('createCustomerPortal')->once()->andReturn(['url' => 'https://billing.stripe.test/session']);
        $this->app->instance(StripeCheckoutService::class, $stripe);

        $this->actingAs($user)->postJson('/dashboard/api/subscription/customer-portal')
            ->assertOk()->assertJsonPath('data.portal_url', 'https://billing.stripe.test/session');
    }
}
