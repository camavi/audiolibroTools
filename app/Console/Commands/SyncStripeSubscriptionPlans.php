<?php

namespace App\Console\Commands;

use App\Models\SubscriptionPlan;
use Illuminate\Console\Command;
use Stripe\StripeClient;

class SyncStripeSubscriptionPlans extends Command
{
    protected $signature = 'billing:sync-stripe-subscription-plans {--force : Create replacement prices for plans already linked to Stripe}';

    protected $description = 'Create Stripe sandbox products and monthly prices for active subscription plans.';

    public function handle(): int
    {
        $secretKey = config('payments.stripe.secret_key');
        if (! filled($secretKey)) {
            $this->error('STRIPE_SECRET_KEY is not configured.');

            return self::FAILURE;
        }
        $stripe = new StripeClient((string) $secretKey);
        $plans = SubscriptionPlan::query()->where('is_active', true)->orderBy('sort_order')->get();
        foreach ($plans as $plan) {
            if (filled($plan->stripe_price_id) && ! $this->option('force')) {
                $this->line("Skipped {$plan->name}: {$plan->stripe_price_id}");
                continue;
            }
            $product = $stripe->products->create([
                'name' => 'Audiobook Tools '.$plan->name,
                'description' => $plan->description,
                'metadata' => ['subscription_plan_id' => (string) $plan->id, 'plan_key' => $plan->plan_key],
            ]);
            $price = $stripe->prices->create([
                'currency' => strtolower($plan->currency),
                'unit_amount' => $plan->monthly_price_cents,
                'recurring' => ['interval' => 'month'],
                'product' => $product->id,
                'metadata' => ['subscription_plan_id' => (string) $plan->id, 'plan_key' => $plan->plan_key],
            ]);
            $plan->update(['stripe_price_id' => $price->id]);
            $this->info("Synced {$plan->name}: {$price->id}");
        }

        return self::SUCCESS;
    }
}
