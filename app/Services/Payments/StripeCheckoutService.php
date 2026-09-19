<?php

namespace App\Services\Payments;

use App\Models\AccountSubscription;
use App\Models\SubscriptionPlan;
use App\Models\TokenPurchase;
use App\Models\User;
use Stripe\StripeClient;

class StripeCheckoutService
{
    public function isConfigured(): bool
    {
        return filled(config('payments.stripe.secret_key'));
    }

    public function createTopUpCheckout(TokenPurchase $purchase, string $email): array
    {
        if (! $this->isConfigured()) {
            abort(422, 'Stripe is not configured yet. Add STRIPE_SECRET_KEY before accepting payments.');
        }

        $metadata = $purchase->metadata_json ?? [];
        $stripe = new StripeClient((string) config('payments.stripe.secret_key'));
        $session = $stripe->checkout->sessions->create([
            'mode' => 'payment',
            'customer_email' => $email,
            'client_reference_id' => (string) $purchase->id,
            'metadata' => ['token_purchase_id' => (string) $purchase->id],
            'payment_intent_data' => ['metadata' => ['token_purchase_id' => (string) $purchase->id]],
            'line_items' => [[
                'quantity' => 1,
                'price_data' => [
                    'currency' => strtolower($purchase->currency),
                    'unit_amount' => $purchase->amount_cents,
                    'product_data' => [
                        'name' => $metadata['package_name'] ?? 'Audiobook Tools tokens',
                        'description' => sprintf('%s tokens', number_format($purchase->credits)),
                    ],
                ],
            ]],
            'success_url' => rtrim((string) config('app.url'), '/').'/dashboard/tokens?checkout=success&session_id={CHECKOUT_SESSION_ID}',
            'cancel_url' => rtrim((string) config('app.url'), '/').'/dashboard/tokens?checkout=cancelled',
        ]);

        return ['id' => $session->id, 'url' => $session->url];
    }

    public function subscriptionCheckoutReady(SubscriptionPlan $plan): bool
    {
        return $this->isConfigured() && filled($plan->stripe_price_id);
    }

    public function createSubscriptionCheckout(User $user, SubscriptionPlan $plan): array
    {
        abort_unless($this->subscriptionCheckoutReady($plan), 422, 'This plan is not ready for Stripe Checkout yet. Sync its Stripe price first.');

        $stripe = new StripeClient((string) config('payments.stripe.secret_key'));
        $session = $stripe->checkout->sessions->create([
            'mode' => 'subscription',
            'customer_email' => $user->email,
            'client_reference_id' => (string) $user->id,
            'metadata' => ['user_id' => (string) $user->id, 'subscription_plan_id' => (string) $plan->id],
            'subscription_data' => ['metadata' => ['user_id' => (string) $user->id, 'subscription_plan_id' => (string) $plan->id]],
            'line_items' => [['price' => $plan->stripe_price_id, 'quantity' => 1]],
            'success_url' => rtrim((string) config('app.url'), '/').'/dashboard/subscription?checkout=success&session_id={CHECKOUT_SESSION_ID}',
            'cancel_url' => rtrim((string) config('app.url'), '/').'/dashboard/subscription?checkout=cancelled',
        ]);

        return ['id' => $session->id, 'url' => $session->url];
    }

    public function previewSubscriptionPlanChange(AccountSubscription $subscription, SubscriptionPlan $plan): array
    {
        abort_unless($this->subscriptionCheckoutReady($plan), 422, 'This plan is not ready for Stripe yet.');

        $stripe = $this->client();
        $current = $stripe->subscriptions->retrieve($subscription->provider_subscription_id, []);
        $item = $current->items->data[0] ?? null;
        abort_unless($item, 422, 'Stripe did not return a subscription item to preview.');
        $prorationDate = now()->timestamp;
        $preview = $stripe->invoices->createPreview([
            'subscription' => $subscription->provider_subscription_id,
            'subscription_details' => [
                'items' => [['id' => $item->id, 'price' => $plan->stripe_price_id]],
                'proration_behavior' => 'always_invoice',
                'proration_date' => $prorationDate,
            ],
        ]);

        return ['amount_due' => (int) $preview->amount_due, 'currency' => strtoupper((string) $preview->currency), 'proration_date' => $prorationDate];
    }

    public function changeSubscriptionPlan(AccountSubscription $subscription, SubscriptionPlan $plan, ?int $prorationDate = null): object
    {
        abort_unless($this->subscriptionCheckoutReady($plan), 422, 'This plan is not ready for Stripe yet.');

        $stripe = $this->client();
        $current = $stripe->subscriptions->retrieve($subscription->provider_subscription_id, []);
        $item = $current->items->data[0] ?? null;
        abort_unless($item, 422, 'Stripe did not return a subscription item to update.');

        return $stripe->subscriptions->update($subscription->provider_subscription_id, [
            'items' => [['id' => $item->id, 'price' => $plan->stripe_price_id]],
            'proration_behavior' => 'always_invoice',
            'payment_behavior' => 'error_if_incomplete',
            'proration_date' => $prorationDate,
            'metadata' => ['user_id' => (string) $subscription->user_id, 'subscription_plan_id' => (string) $plan->id],
        ]);
    }

    public function setSubscriptionCancellation(AccountSubscription $subscription, bool $cancelAtPeriodEnd): object
    {
        return $this->client()->subscriptions->update($subscription->provider_subscription_id, [
            'cancel_at_period_end' => $cancelAtPeriodEnd,
        ]);
    }

    public function createCustomerPortal(AccountSubscription $subscription): array
    {
        $stripe = $this->client();
        $customerId = $subscription->provider_customer_id;
        if (! filled($customerId)) {
            $customerId = $stripe->subscriptions->retrieve($subscription->provider_subscription_id, [])->customer;
        }
        abort_unless(filled($customerId), 422, 'Stripe did not return a customer for this subscription.');

        $session = $stripe->billingPortal->sessions->create([
            'customer' => $customerId,
            'return_url' => rtrim((string) config('app.url'), '/').'/dashboard/subscription?portal=return',
        ]);

        return ['url' => $session->url];
    }

    private function client(): StripeClient
    {
        abort_unless($this->isConfigured(), 422, 'Stripe is not configured yet. Add STRIPE_SECRET_KEY before managing subscriptions.');

        return new StripeClient((string) config('payments.stripe.secret_key'));
    }
}
