<?php

namespace App\Http\Controllers;

use App\Models\AccountSubscription;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Services\Payments\StripeCheckoutService;
use App\Services\Payments\SubscriptionLifecycleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Stripe\Exception\ApiErrorException;

class SubscriptionController extends Controller
{
    public function show(Request $request, StripeCheckoutService $stripe): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        abort_unless($user, 401, 'Please sign in to view your subscription.');
        $subscription = AccountSubscription::query()->where('user_id', $user->id)->whereIn('status', ['active', 'canceling', 'past_due'])->latest('current_period_ends_at')->first();

        return response()->json(['data' => [
            'subscription' => $subscription ? $this->subscription($subscription) : null,
            'plans' => SubscriptionPlan::query()->where('is_active', true)->orderBy('sort_order')->get()->map(fn (SubscriptionPlan $plan) => ['id' => $plan->id, 'name' => $plan->name, 'description' => $plan->description, 'monthly_price_cents' => $plan->monthly_price_cents, 'currency' => $plan->currency, 'monthly_credits' => $plan->monthly_credits, 'checkout_ready' => $stripe->subscriptionCheckoutReady($plan)])->values(),
            'checkout_ready' => $stripe->isConfigured(),
            'portal_ready' => $stripe->isConfigured(),
        ]]);
    }

    public function createCheckout(Request $request, StripeCheckoutService $stripe): JsonResponse
    {
        $user = $this->user($request);
        abort_if(AccountSubscription::query()->where('user_id', $user->id)->whereIn('status', ['active', 'canceling', 'past_due'])->exists(), 422, 'You already have an active subscription. Use Change plan to manage it.');
        $data = $request->validate(['subscription_plan_id' => ['required', 'integer']]);
        $plan = SubscriptionPlan::query()->whereKey($data['subscription_plan_id'])->where('is_active', true)->firstOrFail();
        $checkout = $stripe->createSubscriptionCheckout($user, $plan);

        return response()->json(['data' => ['checkout_url' => $checkout['url']]], 201);
    }

    public function changePlan(Request $request, StripeCheckoutService $stripe, SubscriptionLifecycleService $lifecycle): JsonResponse
    {
        $user = $this->user($request);
        $subscription = $this->manageableSubscription($user);
        abort_if($subscription->cancel_at_period_end, 422, 'Reactivate the subscription before changing plan.');
        $data = $request->validate(['subscription_plan_id' => ['required', 'integer'], 'proration_date' => ['required', 'integer']]);
        $plan = SubscriptionPlan::query()->whereKey($data['subscription_plan_id'])->where('is_active', true)->firstOrFail();
        abort_if($subscription->subscription_plan_id === $plan->id, 422, 'This is already your current plan.');

        try {
            $updated = $stripe->changeSubscriptionPlan($subscription, $plan, $data['proration_date']);
        } catch (ApiErrorException $error) {
            abort(422, $error->getMessage());
        }
        $subscription = $lifecycle->syncStripeSubscription($user, $plan, $updated);

        return response()->json(['data' => ['subscription' => $this->subscription($subscription)]]);
    }

    public function previewPlanChange(Request $request, StripeCheckoutService $stripe): JsonResponse
    {
        $user = $this->user($request);
        $subscription = $this->manageableSubscription($user);
        abort_if($subscription->cancel_at_period_end, 422, 'Reactivate the subscription before changing plan.');
        $data = $request->validate(['subscription_plan_id' => ['required', 'integer']]);
        $plan = SubscriptionPlan::query()->whereKey($data['subscription_plan_id'])->where('is_active', true)->firstOrFail();
        abort_if($subscription->subscription_plan_id === $plan->id, 422, 'This is already your current plan.');

        try {
            $preview = $stripe->previewSubscriptionPlanChange($subscription, $plan);
        } catch (ApiErrorException $error) {
            abort(422, $error->getMessage());
        }

        return response()->json(['data' => ['preview' => $preview]]);
    }

    public function updateCancellation(Request $request, StripeCheckoutService $stripe, SubscriptionLifecycleService $lifecycle): JsonResponse
    {
        $user = $this->user($request);
        $subscription = $this->manageableSubscription($user);
        $data = $request->validate(['cancel_at_period_end' => ['required', 'boolean']]);

        try {
            $updated = $stripe->setSubscriptionCancellation($subscription, $data['cancel_at_period_end']);
        } catch (ApiErrorException $error) {
            abort(422, $error->getMessage());
        }
        $subscription = $lifecycle->syncStripeSubscription($user, $subscription->plan, $updated);

        return response()->json(['data' => ['subscription' => $this->subscription($subscription)]]);
    }

    public function customerPortal(Request $request, StripeCheckoutService $stripe): JsonResponse
    {
        $subscription = $this->manageableSubscription($this->user($request));

        try {
            $portal = $stripe->createCustomerPortal($subscription);
        } catch (ApiErrorException $error) {
            abort(422, $error->getMessage());
        }

        return response()->json(['data' => ['portal_url' => $portal['url']]]);
    }

    private function user(Request $request): User
    {
        /** @var User|null $user */
        $user = $request->user();
        abort_unless($user, 401, 'Please sign in to manage your subscription.');

        return $user;
    }

    private function subscription(AccountSubscription $subscription): array
    {
        return ['id' => $subscription->id, 'status' => $subscription->status, 'plan_name' => $subscription->plan_name, 'monthly_price_cents' => $subscription->monthly_price_cents, 'currency' => $subscription->currency, 'monthly_credits' => $subscription->monthly_credits, 'current_period_ends_at' => $subscription->current_period_ends_at?->toISOString(), 'cancel_at_period_end' => $subscription->cancel_at_period_end, 'grants' => $subscription->grants()->latest('period_starts_at')->take(12)->get()->map(fn ($grant) => ['id' => $grant->id, 'credits' => $grant->credits, 'period_starts_at' => $grant->period_starts_at?->toISOString()])->values()];
    }

    private function manageableSubscription(User $user): AccountSubscription
    {
        return AccountSubscription::query()->with('plan')->where('user_id', $user->id)->where('provider', 'stripe')->whereIn('status', ['active', 'canceling', 'past_due'])->latest('current_period_ends_at')->firstOr(fn () => abort(422, 'There is no active Stripe subscription to manage.'));
    }
}
