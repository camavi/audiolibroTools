<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Stripe\StripeClient;

class AdvanceStripeSubscriptionClockTest extends Command
{
    protected $signature = 'billing:advance-stripe-subscription-clock-test {clock_id}';

    protected $description = 'Advance a Stripe Test Clock by one month to test an audiobook subscription renewal.';

    public function handle(): int
    {
        $secretKey = config('payments.stripe.secret_key');
        if (! filled($secretKey)) {
            $this->error('STRIPE_SECRET_KEY is not configured.');

            return self::FAILURE;
        }
        $stripe = new StripeClient((string) $secretKey);
        $clock = $stripe->testHelpers->testClocks->retrieve((string) $this->argument('clock_id'));
        $advanced = $stripe->testHelpers->testClocks->advance($clock->id, ['frozen_time' => $clock->frozen_time + 31 * 24 * 60 * 60]);
        $this->info("Clock {$advanced->id} is advancing. Wait until Stripe marks it ready, then refresh the wallet.");

        return self::SUCCESS;
    }
}
