<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_guests_cannot_access_the_dashboard_or_its_api(): void
    {
        $this->get('/dashboard')->assertRedirect('/');
        $this->getJson('/dashboard/api/books')->assertUnauthorized();
    }

    public function test_authenticated_users_can_open_the_dashboard(): void
    {
        $this->actingAs(User::factory()->create())
            ->get('/dashboard')
            ->assertOk();
    }
}
