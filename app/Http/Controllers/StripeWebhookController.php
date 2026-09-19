<?php

namespace App\Http\Controllers;

use App\Models\TokenPurchase;
use App\Services\Payments\TokenPurchaseService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Stripe\Exception\SignatureVerificationException;
use Stripe\Webhook;

class StripeWebhookController extends Controller
{
    public function handle(Request $request, TokenPurchaseService $purchases)
    {
        $secret = config('payments.stripe.webhook_secret');
        abort_unless(filled($secret), 503, 'Stripe webhook signing secret is not configured.');

        try {
            $event = Webhook::constructEvent($request->getContent(), (string) $request->header('Stripe-Signature'), $secret);
        } catch (\UnexpectedValueException|SignatureVerificationException) {
            abort(400, 'Invalid Stripe webhook signature.');
        }

        if ($event->type !== 'checkout.session.completed') return response()->json(['received' => true]);

        $session = $event->data->object;
        if (($session->payment_status ?? null) !== 'paid') return response()->json(['received' => true]);
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
}
