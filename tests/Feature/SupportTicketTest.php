<?php

namespace Tests\Feature;

use App\Models\SupportTicket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SupportTicketTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_create_and_read_only_their_own_support_ticket(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();

        $this->actingAs($owner)->postJson('/dashboard/api/support/tickets', [
            'subject' => 'Audio generation failed',
            'category' => 'audio',
            'message' => 'The final file is missing.',
        ])->assertCreated()->assertJsonPath('data.ticket.subject', 'Audio generation failed');

        $ticket = SupportTicket::query()->firstOrFail();
        $this->assertDatabaseHas('support_ticket_messages', ['support_ticket_id' => $ticket->id, 'body' => 'The final file is missing.']);
        $this->actingAs($other)->getJson("/dashboard/api/support/tickets/{$ticket->id}")->assertForbidden();
        $this->actingAs($owner)->getJson("/dashboard/api/support/tickets/{$ticket->id}")->assertOk()->assertJsonCount(1, 'data.ticket.messages');
    }

    public function test_staff_can_reply_privately_and_admin_can_list_users(): void
    {
        $customer = User::factory()->create();
        $support = User::factory()->create(['role' => 'support']);
        $admin = User::factory()->create(['role' => 'admin']);
        $ticket = SupportTicket::query()->create(['account_id' => $customer->id, 'subject' => 'Account help', 'status' => 'open']);

        $this->actingAs($support)->postJson("/dashboard/api/admin/tickets/{$ticket->id}/messages", ['message' => 'Internal diagnosis.', 'is_internal' => true])
            ->assertCreated();
        $this->actingAs($customer)->getJson("/dashboard/api/support/tickets/{$ticket->id}")
            ->assertOk()->assertJsonCount(0, 'data.ticket.messages');
        $this->actingAs($support)->getJson('/dashboard/api/admin/users')->assertForbidden();
        $this->actingAs($admin)->getJson('/dashboard/api/admin/users?search='.urlencode($admin->email))->assertOk()->assertJsonPath('data.users.0.id', $admin->id);
        $this->actingAs($admin)->patchJson("/dashboard/api/admin/users/{$customer->id}", ['role' => 'support'])
            ->assertOk()->assertJsonPath('data.user.role', 'support');
        $this->assertDatabaseHas('admin_audit_logs', ['actor_id' => $admin->id, 'account_id' => $customer->id, 'event' => 'admin.user.role_updated']);
        $this->assertDatabaseHas('admin_audit_logs', ['actor_id' => $support->id, 'account_id' => $customer->id, 'event' => 'support.ticket.replied']);
    }
}
