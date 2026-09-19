<?php

namespace App\Http\Controllers;

use App\Models\AccountSubscription;
use App\Models\SubscriptionPlan;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SubscriptionController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        abort_unless($user, 401, 'Please sign in to view your subscription.');
        $subscription = AccountSubscription::query()->where('user_id', $user->id)->whereIn('status', ['active', 'canceling', 'past_due'])->latest('current_period_ends_at')->first();

        return response()->json(['data' => [
            'subscription' => $subscription ? $this->subscription($subscription) : null,
            'plans' => SubscriptionPlan::query()->where('is_active', true)->orderBy('sort_order')->get()->map(fn (SubscriptionPlan $plan) => ['id' => $plan->id, 'name' => $plan->name, 'description' => $plan->description, 'monthly_price_cents' => $plan->monthly_price_cents, 'currency' => $plan->currency, 'monthly_credits' => $plan->monthly_credits])->values(),
            'checkout_ready' => false,
        ]]);
    }

    private function subscription(AccountSubscription $subscription): array
    {
        return ['id' => $subscription->id, 'status' => $subscription->status, 'plan_name' => $subscription->plan_name, 'monthly_price_cents' => $subscription->monthly_price_cents, 'currency' => $subscription->currency, 'monthly_credits' => $subscription->monthly_credits, 'current_period_ends_at' => $subscription->current_period_ends_at?->toISOString(), 'cancel_at_period_end' => $subscription->cancel_at_period_end, 'grants' => $subscription->grants()->latest('period_starts_at')->take(12)->get()->map(fn ($grant) => ['id' => $grant->id, 'credits' => $grant->credits, 'period_starts_at' => $grant->period_starts_at?->toISOString()])->values()];
    }
}
