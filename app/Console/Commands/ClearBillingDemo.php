<?php

namespace App\Console\Commands;

use App\Models\AccountCreditBalance;
use App\Models\AccountCreditLedgerEntry;
use App\Models\TokenPurchase;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ClearBillingDemo extends Command
{
    protected $signature = 'billing:clear-demo';

    protected $description = 'Remove only customers and purchase data created by billing:seed-demo.';

    public function handle(): int
    {
        $userIds = User::query()->where('email', 'like', 'demo.billing.%@example.test')->pluck('id');
        if ($userIds->isEmpty()) {
            $this->info('No billing demo data found.');

            return self::SUCCESS;
        }

        $purchaseCount = TokenPurchase::query()->whereIn('user_id', $userIds)->count();
        DB::transaction(function () use ($userIds): void {
            AccountCreditLedgerEntry::query()->whereIn('account_id', $userIds)->delete();
            AccountCreditBalance::query()->whereIn('account_id', $userIds)->delete();
            TokenPurchase::query()->whereIn('user_id', $userIds)->delete();
            User::query()->whereIn('id', $userIds)->delete();
        });
        $this->info("Removed {$userIds->count()} demo customers and {$purchaseCount} demo checkout records.");

        return self::SUCCESS;
    }
}
