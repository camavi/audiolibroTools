<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_register_from_the_home_dialog(): void
    {
        Notification::fake();

        $this->postJson('/auth/register', ['name' => 'Ada Writer', 'email' => 'ada@example.com', 'password' => 'secure-password', 'password_confirmation' => 'secure-password'])
            ->assertCreated()
            ->assertJsonPath('data.redirect', '/dashboard')
            ->assertJsonPath('data.email_verification_sent', true);

        $this->assertAuthenticated();
        $this->assertDatabaseHas('users', ['email' => 'ada@example.com']);
        Notification::assertSentTo(User::query()->where('email', 'ada@example.com')->firstOrFail(), VerifyEmail::class);
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

    public function test_home_exposes_every_navigation_section_and_active_subscription_plans(): void
    {
        $this->get('/en')
            ->assertOk()
            ->assertSee('id="features"', false)
            ->assertSee('id="demo"', false)
            ->assertSee('id="pricing"', false)
            ->assertSee('id="resources"', false)
            ->assertSee('id="blog"', false)
            ->assertSee('class="site-footer"', false)
            ->assertSeeText('Menu')
            ->assertSeeText('Starter')
            ->assertSeeText('Creator')
            ->assertSeeText('Studio');
    }

    public function test_italian_home_localizes_the_auth_dialog_and_exposes_mobile_navigation(): void
    {
        $this->get('/it')
            ->assertOk()
            ->assertSee('class="mobile-nav-trigger"', false)
            ->assertSee('id="mobile-nav-drawer"', false)
            ->assertSeeText('Menu')
            ->assertSeeText('Bentornato')
            ->assertSeeText('Accedi per continuare nel tuo spazio di lavoro.')
            ->assertSeeText('Resta connesso')
            ->assertSeeText('Crea un account');
    }

    public function test_user_can_request_a_password_reset_link_without_revealing_whether_the_email_exists(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'ada@example.com']);

        $this->postJson('/auth/forgot-password', ['email' => $user->email])
            ->assertOk()
            ->assertJsonPath('data.message', 'If an account matches this email address, we have sent instructions to reset its password.');
        $this->postJson('/auth/forgot-password', ['email' => 'missing@example.com'])->assertOk();

        Notification::assertSentTo($user, ResetPassword::class);
    }

    public function test_user_can_reset_their_password_from_a_valid_token(): void
    {
        $user = User::factory()->create(['email' => 'ada@example.com', 'password' => Hash::make('old-password')]);
        $token = Password::createToken($user);

        $this->post('/auth/reset-password', ['token' => $token, 'email' => $user->email, 'password' => 'new-secure-password', 'password_confirmation' => 'new-secure-password'])
            ->assertRedirect('/en');

        $this->assertTrue(Hash::check('new-secure-password', $user->fresh()->password));
    }

    public function test_authenticated_user_can_verify_a_signed_email_link(): void
    {
        $user = User::factory()->unverified()->create(['email' => 'ada@example.com']);
        $url = URL::temporarySignedRoute('verification.verify', now()->addMinutes(30), ['id' => $user->id, 'hash' => sha1($user->email)]);

        $this->actingAs($user)->get($url)->assertRedirect('/en');

        $this->assertNotNull($user->fresh()->email_verified_at);
    }
}
