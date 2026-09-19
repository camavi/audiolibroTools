<?php

namespace App\Services\Payments;

use App\Models\AccountCreditBalance;
use App\Models\AccountCreditLedgerEntry;
use App\Models\AccountSubscription;
use App\Models\SubscriptionCreditGrant;
use App\Models\SubscriptionPlan;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class SubscriptionLifecycleService
{
    public function activate(User $user, SubscriptionPlan $plan, string $providerSubscriptionId, Carbon $periodStartsAt, Carbon $periodEndsAt): AccountSubscription
    {
        return DB::transaction(function () use ($user, $plan, $providerSubscriptionId, $periodStartsAt, $periodEndsAt): AccountSubscription {
            AccountSubscription::query()->where('user_id', $user->id)->whereIn('status', ['active', 'canceling', 'past_due'])->update(['status' => 'replaced', 'cancelled_at' => now()]);
            $subscription = AccountSubscription::query()->updateOrCreate(
                ['provider' => 'stripe', 'provider_subscription_id' => $providerSubscriptionId],
                ['user_id' => $user->id, 'subscription_plan_id' => $plan->id, 'status' => 'active', 'plan_name' => $plan->name, 'monthly_price_cents' => $plan->monthly_price_cents, 'currency' => $plan->currency, 'monthly_credits' => $plan->monthly_credits, 'current_period_starts_at' => $periodStartsAt, 'current_period_ends_at' => $periodEndsAt, 'cancel_at_period_end' => false, 'cancelled_at' => null, 'metadata_json' => ['plan_key' => $plan->plan_key]],
            );

            return $this->grantPeriod($subscription);
        });
    }

    public function grantPeriod(AccountSubscription $subscription): AccountSubscription
    {
        return DB::transaction(function () use ($subscription): AccountSubscription {
            $locked = AccountSubscription::query()->lockForUpdate()->findOrFail($subscription->id);
            $grant = SubscriptionCreditGrant::query()->firstOrCreate(
                ['account_subscription_id' => $locked->id, 'period_starts_at' => $locked->current_period_starts_at],
                ['user_id' => $locked->user_id, 'credits' => $locked->monthly_credits, 'granted_at' => now(), 'metadata_json' => ['reason' => 'subscription_period_grant', 'plan_name' => $locked->plan_name]],
            );
            if (! $grant->wasRecentlyCreated) return $locked;

            $balance = AccountCreditBalance::query()->firstOrCreate(['account_id' => $locked->user_id], ['available_credits' => 0, 'reserved_credits' => 0, 'consumed_credits' => 0]);
            AccountCreditBalance::query()->whereKey($balance->id)->lockForUpdate()->firstOrFail()->increment('available_credits', $grant->credits);
            AccountCreditLedgerEntry::query()->create(['account_id' => $locked->user_id, 'type' => 'subscription_grant', 'credits' => $grant->credits, 'metadata_json' => ['reason' => 'subscription_period_grant', 'account_subscription_id' => $locked->id, 'subscription_credit_grant_id' => $grant->id, 'period_starts_at' => $locked->current_period_starts_at->toISOString()]]);

            return $locked;
        });
    }

    public function scheduleCancellation(AccountSubscription $subscription): AccountSubscription
    {
        $subscription->update(['cancel_at_period_end' => true, 'status' => 'canceling']);

        return $subscription->fresh();
    }
}
