<?php

namespace Tests\Feature;

use App\Models\AccountCreditBalance;
use App\Models\AccountCreditLedgerEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TokenWalletTest extends TestCase
{
    use RefreshDatabase;

    public function test_signed_in_user_can_view_wallet_and_save_auto_recharge(): void
    {
        $user = User::factory()->create();
        AccountCreditBalance::query()->create(['account_id' => $user->id, 'available_credits' => 950, 'reserved_credits' => 120, 'consumed_credits' => 200]);
        AccountCreditLedgerEntry::query()->create(['account_id' => $user->id, 'type' => 'consumed', 'credits' => 200, 'metadata_json' => ['reason' => 'translation_block_completed']]);

        $this->actingAs($user)->getJson('/dashboard/api/tokens')->assertOk()
            ->assertJsonPath('data.balance.available_credits', 950)
            ->assertJsonPath('data.usage.consumed_last_30_days', 200);

        $this->actingAs($user)->patchJson('/dashboard/api/tokens/auto-recharge', ['enabled' => true, 'threshold' => 500, 'amount' => 2000])
            ->assertOk()->assertJsonPath('data.balance.auto_recharge_enabled', true);

        $this->assertDatabaseHas('account_credit_balances', ['account_id' => $user->id, 'auto_recharge_enabled' => true, 'auto_recharge_threshold' => 500, 'auto_recharge_amount' => 2000]);
    }

    public function test_auto_recharge_rejects_a_threshold_above_the_recharge_amount(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->patchJson('/dashboard/api/tokens/auto-recharge', ['enabled' => true, 'threshold' => 1000, 'amount' => 1000])
            ->assertUnprocessable()->assertJsonValidationErrors('threshold');
    }
}
