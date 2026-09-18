<?php

namespace Tests\Feature;

use App\Models\TokenPackage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminTokenPackageTest extends TestCase
{
    use RefreshDatabase;

    public function test_administrators_manage_token_packages_and_wallet_only_shows_active_ones(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $user = User::factory()->create(['role' => 'user']);

        $this->actingAs($user)->getJson('/dashboard/api/admin/token-packages')->assertForbidden();
        $this->actingAs($admin)->getJson('/dashboard/api/admin/token-packages')->assertOk()->assertJsonCount(3, 'data.packages');
        $this->actingAs($admin)->postJson('/dashboard/api/admin/token-packages', ['name' => 'Ultra', 'description' => 'Large top-up.', 'price_cents' => 4900, 'currency' => 'eur', 'credits' => 25000, 'is_active' => false])->assertCreated()->assertJsonPath('data.package.package_key', 'ultra');

        $this->actingAs($user)->getJson('/dashboard/api/tokens')->assertOk()->assertJsonCount(3, 'data.top_up_packages');
        $package = TokenPackage::query()->where('package_key', 'ultra')->firstOrFail();
        $this->actingAs($admin)->patchJson("/dashboard/api/admin/token-packages/{$package->id}", ['name' => 'Ultra', 'description' => null, 'price_cents' => 4999, 'currency' => 'eur', 'credits' => 25000, 'is_active' => true])->assertOk()->assertJsonPath('data.package.currency', 'EUR');
        $this->actingAs($user)->getJson('/dashboard/api/tokens')->assertOk()->assertJsonCount(4, 'data.top_up_packages');
        $this->actingAs($admin)->deleteJson("/dashboard/api/admin/token-packages/{$package->id}")->assertNoContent();
    }
}
