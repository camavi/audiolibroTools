<?php

namespace App\Console\Commands;

use App\Models\AccountCreditBalance;
use App\Models\AccountCreditLedgerEntry;
use App\Models\TokenPackage;
use App\Models\TokenPurchase;
use App\Models\User;
use App\Services\Payments\TokenPurchaseService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class SeedBillingDemo extends Command
{
    protected $signature = 'billing:seed-demo {--customers=36 : Number of isolated demo customers} {--purchases=180 : Number of demo checkout records}';

    protected $description = 'Create isolated demo token-purchase data for the Billing dashboard.';

    public function handle(TokenPurchaseService $creditService): int
    {
        $packages = TokenPackage::query()->orderBy('sort_order')->get();
        if ($packages->isEmpty()) {
            $this->error('No token packages exist. Run migrations before seeding billing demo data.');

            return self::FAILURE;
        }

        $this->clear();
        $customerCount = max(1, min(200, (int) $this->option('customers')));
        $purchaseCount = max(1, min(2000, (int) $this->option('purchases')));
        $users = collect();

        DB::transaction(function () use ($customerCount, $users): void {
            for ($index = 1; $index <= $customerCount; $index++) {
                $users->push(User::query()->create([
                    'name' => "Demo billing customer {$index}",
                    'email' => sprintf('demo.billing.%03d@example.test', $index),
                    'email_verified_at' => now(),
                    'password' => Hash::make('demo-billing-only'),
                    'role' => 'user',
                    'account_status' => 'active',
                ]));
            }
        });

        $paid = 0;
        foreach (range(0, $purchaseCount - 1) as $index) {
            $package = $packages[$index % $packages->count()];
            $status = match ($index % 9) {
                0 => 'failed',
                1 => 'pending',
                2 => 'checkout_created',
                default => 'paid',
            };
            $occurredAt = now()->subDays(($index * 11) % 90)->subHours($index % 18);
            $purchase = new TokenPurchase();
            $purchase->timestamps = false;
            $purchase->forceFill([
                'user_id' => $users[$index % $users->count()]->id,
                'token_package_id' => $package->id,
                'provider' => 'stripe',
                'provider_checkout_session_id' => sprintf('cs_demo_%05d', $index + 1),
                'provider_payment_intent_id' => $status === 'paid' ? sprintf('pi_demo_%05d', $index + 1) : null,
                'amount_cents' => $package->price_cents,
                'currency' => $package->currency,
                'credits' => $package->credits,
                'status' => $status,
                'metadata_json' => ['package_key' => $package->package_key, 'package_name' => $package->name, 'demo_seed' => true],
                'created_at' => $occurredAt,
                'updated_at' => $occurredAt,
                'paid_at' => $status === 'paid' ? $occurredAt : null,
                'credited_at' => null,
            ])->save();

            if ($status !== 'paid') continue;
            $creditService->creditPaidPurchase($purchase, $purchase->provider_payment_intent_id);
            TokenPurchase::query()->whereKey($purchase->id)->update(['created_at' => $occurredAt, 'updated_at' => $occurredAt, 'paid_at' => $occurredAt, 'credited_at' => $occurredAt]);
            $paid++;
        }

        $this->info("Created {$customerCount} demo customers and {$purchaseCount} checkout records ({$paid} paid). Use billing:clear-demo to remove only this demo data.");

        return self::SUCCESS;
    }

    private function clear(): void
    {
        $userIds = User::query()->where('email', 'like', 'demo.billing.%@example.test')->pluck('id');
        if ($userIds->isEmpty()) return;

        DB::transaction(function () use ($userIds): void {
            AccountCreditLedgerEntry::query()->whereIn('account_id', $userIds)->delete();
            AccountCreditBalance::query()->whereIn('account_id', $userIds)->delete();
            TokenPurchase::query()->whereIn('user_id', $userIds)->delete();
            User::query()->whereIn('id', $userIds)->delete();
        });
    }
}
