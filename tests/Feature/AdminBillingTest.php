<?php

namespace Tests\Feature;

use App\Models\TokenPackage;
use App\Models\TokenPurchase;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminBillingTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_view_paid_token_sales_grouped_by_week(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $user = User::factory()->create();
        $package = TokenPackage::query()->where('package_key', 'mini')->firstOrFail();
        TokenPurchase::query()->create(['user_id' => $user->id, 'token_package_id' => $package->id, 'provider' => 'stripe', 'amount_cents' => 399, 'currency' => 'EUR', 'credits' => 1000, 'status' => 'paid', 'metadata_json' => ['package_key' => 'mini', 'package_name' => 'Mini'], 'paid_at' => now()->subDays(2)]);
        TokenPurchase::query()->create(['user_id' => $user->id, 'token_package_id' => $package->id, 'provider' => 'stripe', 'amount_cents' => 399, 'currency' => 'EUR', 'credits' => 1000, 'status' => 'failed', 'metadata_json' => ['package_key' => 'mini', 'package_name' => 'Mini']]);

        $this->actingAs(User::factory()->create())->getJson('/dashboard/api/admin/billing/token-sales')->assertForbidden();
        $this->actingAs($admin)->getJson('/dashboard/api/admin/billing/token-sales?period=30&group_by=week')
            ->assertOk()->assertJsonPath('data.summary.revenue_cents', 399)->assertJsonPath('data.summary.paid_purchases', 1)->assertJsonPath('data.summary.credits_sold', 1000)->assertJsonPath('data.packages.0.name', 'Mini')->assertJsonPath('data.group_by', 'week');
    }
}
