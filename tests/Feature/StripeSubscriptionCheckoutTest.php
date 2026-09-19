<?php

namespace Tests\Feature;

use App\Models\AccountCreditBalance;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Services\Payments\StripeCheckoutService;
use App\Services\Payments\SubscriptionLifecycleService;
use Carbon\Carbon;
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
}
