<?php

namespace App\Console\Commands;

use App\Models\SubscriptionPlan;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Stripe\StripeClient;

class CreateStripeSubscriptionClockTest extends Command
{
    protected $signature = 'billing:create-subscription-clock-test {--email=stripe.clock.test@example.test} {--password=stripe-clock-test} {--plan=starter}';

    protected $description = 'Create an isolated local user and Stripe Test Clock subscription for renewal testing.';

    public function handle(): int
    {
        $plan = SubscriptionPlan::query()->where('plan_key', $this->option('plan'))->where('is_active', true)->first();
        if (! $plan || ! filled($plan->stripe_price_id)) {
            $this->error('The selected active plan needs a synced Stripe price first.');

            return self::FAILURE;
        }
        $secretKey = config('payments.stripe.secret_key');
        if (! filled($secretKey)) {
            $this->error('STRIPE_SECRET_KEY is not configured.');

            return self::FAILURE;
        }
        $email = strtolower((string) $this->option('email'));
        $user = User::query()->firstOrCreate(
            ['email' => $email],
            ['name' => 'Stripe clock test user', 'email_verified_at' => now(), 'password' => Hash::make((string) $this->option('password')), 'role' => 'user', 'account_status' => 'active'],
        );
        $stripe = new StripeClient((string) $secretKey);
        $clock = $stripe->testHelpers->testClocks->create(['frozen_time' => now()->timestamp, 'name' => 'Audiobook Tools subscription renewal test']);
        $customer = $stripe->customers->create(['email' => $user->email, 'name' => $user->name, 'test_clock' => $clock->id, 'metadata' => ['audiobook_tools_user_id' => (string) $user->id, 'demo_subscription_clock' => 'true']]);
        $paymentMethod = $stripe->paymentMethods->attach('pm_card_visa', ['customer' => $customer->id]);
        $stripe->customers->update($customer->id, ['invoice_settings' => ['default_payment_method' => $paymentMethod->id]]);
        $subscription = $stripe->subscriptions->create([
            'customer' => $customer->id,
            'items' => [['price' => $plan->stripe_price_id]],
            'metadata' => ['user_id' => (string) $user->id, 'subscription_plan_id' => (string) $plan->id, 'demo_subscription_clock' => 'true'],
        ]);
        $this->info("Created Stripe Test Clock renewal scenario for {$user->email}.");
        $this->line("Password: {$this->option('password')}");
        $this->line("Clock: {$clock->id}");
        $this->line("Subscription: {$subscription->id}");
        $this->line('Keep stripe listen running, then advance the clock by one month with billing:advance-stripe-subscription-clock-test.');

        return self::SUCCESS;
    }
}
