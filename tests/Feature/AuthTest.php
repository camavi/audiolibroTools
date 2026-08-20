<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_register_from_the_home_dialog(): void
    {
        $this->postJson('/auth/register', ['name' => 'Ada Writer', 'email' => 'ada@example.com', 'password' => 'secure-password', 'password_confirmation' => 'secure-password'])
            ->assertCreated()
            ->assertJsonPath('data.redirect', '/dashboard');

        $this->assertAuthenticated();
        $this->assertDatabaseHas('users', ['email' => 'ada@example.com']);
    }

    public function test_user_can_log_in_and_invalid_credentials_are_rejected(): void
    {
        User::query()->create(['name' => 'Ada Writer', 'email' => 'ada@example.com', 'password' => Hash::make('secure-password')]);
        $this->postJson('/auth/login', ['email' => 'ada@example.com', 'password' => 'wrong-password'])->assertUnprocessable();
        $this->postJson('/auth/login', ['email' => 'ada@example.com', 'password' => 'secure-password', 'remember' => true])
            ->assertOk()
            ->assertJsonPath('data.redirect', '/dashboard');
        $this->assertAuthenticated();
    }

    public function test_user_can_log_out(): void
    {
        $this->actingAs(User::factory()->create())->postJson('/auth/logout')
            ->assertOk()
            ->assertJsonPath('data.redirect', '/');

        $this->assertGuest();
    }
}
