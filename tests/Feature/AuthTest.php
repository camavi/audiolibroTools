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

    public function test_home_shows_the_user_menu_to_an_authenticated_user(): void
    {
        $user = User::factory()->create(['name' => 'Ada Writer', 'email' => 'ada@example.com']);

        $this->actingAs($user)->get('/en')
            ->assertOk()
            ->assertSee('home-user-menu', false)
            ->assertSee('Ada Writer')
            ->assertSee('ada@example.com')
            ->assertSee('href="'.url('/dashboard').'"', false)
            ->assertDontSee('data-auth-mode="login"', false)
            ->assertDontSee('data-auth-mode="register"', false)
            ->assertDontSee('Start free');
    }

    public function test_home_shows_auth_actions_to_a_guest(): void
    {
        $this->get('/en')
            ->assertOk()
            ->assertSee('data-auth-mode="login"', false)
            ->assertSee('data-auth-mode="register"', false)
            ->assertDontSee('home-user-menu', false);
    }
}
