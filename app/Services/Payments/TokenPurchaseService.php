<?php

namespace App\Services\Payments;

use App\Models\AccountCreditBalance;
use App\Models\AccountCreditLedgerEntry;
use App\Models\TokenPurchase;
use Illuminate\Support\Facades\DB;

class TokenPurchaseService
{
    public function creditPaidPurchase(TokenPurchase $purchase, ?string $paymentIntentId = null): TokenPurchase
    {
        return DB::transaction(function () use ($purchase, $paymentIntentId): TokenPurchase {
            $locked = TokenPurchase::query()->lockForUpdate()->findOrFail($purchase->id);
            if ($locked->credited_at) return $locked;

            $balance = AccountCreditBalance::query()->firstOrCreate(['account_id' => $locked->user_id], ['available_credits' => 0, 'reserved_credits' => 0, 'consumed_credits' => 0]);
            $balance = AccountCreditBalance::query()->whereKey($balance->id)->lockForUpdate()->firstOrFail();
            $balance->increment('available_credits', $locked->credits);
            AccountCreditLedgerEntry::query()->create([
                'account_id' => $locked->user_id,
                'type' => 'top_up',
                'credits' => $locked->credits,
                'metadata_json' => ['reason' => 'stripe_token_purchase', 'token_purchase_id' => $locked->id, 'stripe_checkout_session_id' => $locked->provider_checkout_session_id, 'stripe_payment_intent_id' => $paymentIntentId],
            ]);
            $locked->update(['status' => 'paid', 'provider_payment_intent_id' => $paymentIntentId ?: $locked->provider_payment_intent_id, 'paid_at' => $locked->paid_at ?: now(), 'credited_at' => now()]);

            return $locked->fresh();
        });
    }
}
