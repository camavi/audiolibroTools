<?php

namespace Tests\Feature;

use App\Models\AccountCreditBalance;
use App\Models\AccountCreditLedgerEntry;
use App\Models\TokenPackage;
use App\Models\TokenPurchase;
use App\Models\User;
use App\Services\Payments\StripeCheckoutService;
use App\Services\Payments\TokenPurchaseService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

class StripeTokenCheckoutTest extends TestCase
{
    use RefreshDatabase;

    public function test_checkout_creates_a_purchase_using_the_active_catalog_package(): void
    {
        $user = User::factory()->create();
        $package = TokenPackage::query()->where('package_key', 'mini')->firstOrFail();
        $stripe = Mockery::mock(StripeCheckoutService::class);
        $stripe->shouldReceive('createTopUpCheckout')->once()->andReturn(['id' => 'cs_test_123', 'url' => 'https://checkout.stripe.test/session']);
        $this->app->instance(StripeCheckoutService::class, $stripe);

        $this->actingAs($user)->postJson('/dashboard/api/tokens/checkout', ['token_package_id' => $package->id])
            ->assertCreated()->assertJsonPath('data.checkout_url', 'https://checkout.stripe.test/session');

        $this->assertDatabaseHas('token_purchases', ['user_id' => $user->id, 'token_package_id' => $package->id, 'provider_checkout_session_id' => 'cs_test_123', 'amount_cents' => $package->price_cents, 'credits' => $package->credits, 'status' => 'checkout_created']);
    }

    public function test_paid_purchase_is_credited_exactly_once(): void
    {
        $user = User::factory()->create();
        $package = TokenPackage::query()->where('package_key', 'mini')->firstOrFail();
        $purchase = TokenPurchase::query()->create(['user_id' => $user->id, 'token_package_id' => $package->id, 'provider' => 'stripe', 'provider_checkout_session_id' => 'cs_test_paid', 'amount_cents' => $package->price_cents, 'currency' => 'EUR', 'credits' => $package->credits, 'status' => 'checkout_created']);

        $service = app(TokenPurchaseService::class);
        $service->creditPaidPurchase($purchase, 'pi_test_paid');
        $service->creditPaidPurchase($purchase->fresh(), 'pi_test_paid');

        $this->assertDatabaseHas('account_credit_balances', ['account_id' => $user->id, 'available_credits' => $package->credits]);
        $this->assertSame(1, AccountCreditLedgerEntry::query()->where('account_id', $user->id)->where('type', 'top_up')->count());
        $this->assertDatabaseHas('token_purchases', ['id' => $purchase->id, 'status' => 'paid', 'provider_payment_intent_id' => 'pi_test_paid']);
    }
}
