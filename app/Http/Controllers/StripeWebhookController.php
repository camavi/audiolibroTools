<?php

namespace App\Http\Controllers;

use App\Models\AccountSubscription;
use App\Models\SubscriptionPlan;
use App\Models\TokenPurchase;
use App\Models\User;
use App\Services\Payments\SubscriptionLifecycleService;
use App\Services\Payments\TokenPurchaseService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Stripe\Exception\SignatureVerificationException;
use Stripe\Webhook;

class StripeWebhookController extends Controller
{
    public function handle(Request $request, TokenPurchaseService $purchases, SubscriptionLifecycleService $subscriptions)
    {
        $secret = config('payments.stripe.webhook_secret');
        abort_unless(filled($secret), 503, 'Stripe webhook signing secret is not configured.');

        try {
            $event = Webhook::constructEvent($request->getContent(), (string) $request->header('Stripe-Signature'), $secret);
        } catch (\UnexpectedValueException|SignatureVerificationException) {
            abort(400, 'Invalid Stripe webhook signature.');
        }

        if (in_array($event->type, ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'], true)) {
            $this->syncSubscription($event->data->object, $subscriptions);

            return response()->json(['received' => true]);
        }
        if ($event->type === 'invoice.paid') {
            $this->grantPaidInvoicePeriod($event->data->object, $subscriptions);

            return response()->json(['received' => true]);
        }
        if ($event->type !== 'checkout.session.completed') {
            return response()->json(['received' => true]);
        }

        $session = $event->data->object;
        if (($session->mode ?? null) === 'subscription') {
            return response()->json(['received' => true]);
        }
        if (($session->payment_status ?? null) !== 'paid') {
            return response()->json(['received' => true]);
        }
        $purchaseId = $session->metadata->token_purchase_id ?? $session->client_reference_id ?? null;
        $purchase = TokenPurchase::query()->find($purchaseId);
        if (! $purchase || $purchase->provider !== 'stripe' || $purchase->provider_checkout_session_id !== $session->id) {
            Log::warning('Stripe checkout could not be matched to a token purchase.', ['session_id' => $session->id, 'purchase_id' => $purchaseId]);

            return response()->json(['received' => true]);
        }
        if ((int) $session->amount_total !== $purchase->amount_cents || strtoupper((string) $session->currency) !== $purchase->currency) {
            Log::warning('Stripe checkout total does not match the token purchase.', ['session_id' => $session->id, 'purchase_id' => $purchase->id]);

            return response()->json(['received' => true]);
        }

        $purchases->creditPaidPurchase($purchase, is_string($session->payment_intent ?? null) ? $session->payment_intent : null);

        return response()->json(['received' => true]);
    }

    private function syncSubscription(object $stripeSubscription, SubscriptionLifecycleService $subscriptions): void
    {
        $metadata = $stripeSubscription->metadata ?? null;
        $userId = $metadata->user_id ?? null;
        $planId = $metadata->subscription_plan_id ?? null;
        $user = User::query()->find($userId);
        $priceId = $stripeSubscription->items->data[0]->price->id ?? null;
        $plan = filled($priceId) ? SubscriptionPlan::query()->where('stripe_price_id', $priceId)->first() : null;
        $plan = $plan ?: SubscriptionPlan::query()->find($planId);

        if (! $user || ! $plan) {
            $existing = AccountSubscription::query()->where('provider', 'stripe')->where('provider_subscription_id', $stripeSubscription->id ?? null)->first();
            $user = $user ?: $existing?->user;
            $plan = $plan ?: $existing?->plan;
        }
        if (! $user || ! $plan) {
            Log::warning('Stripe subscription could not be mapped to an Audiobook Tools user and plan.', ['subscription_id' => $stripeSubscription->id ?? null]);

            return;
        }

        $subscriptions->syncStripeSubscription($user, $plan, $stripeSubscription);
    }

    private function grantPaidInvoicePeriod(object $invoice, SubscriptionLifecycleService $subscriptions): void
    {
        $subscriptionId = $invoice->subscription ?? $invoice->parent?->subscription_details?->subscription ?? null;
        if (! is_string($subscriptionId)) {
            return;
        }
        $subscription = AccountSubscription::query()->where('provider', 'stripe')->where('provider_subscription_id', $subscriptionId)->first();
        if ($subscription) {
            $subscriptions->grantPeriod($subscription);
        }
    }
}
