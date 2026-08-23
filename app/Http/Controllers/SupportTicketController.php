<?php

namespace App\Http\Controllers;

use App\Models\SupportTicket;
use App\Models\SupportTicketMessage;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SupportTicketController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $tickets = SupportTicket::query()
            ->where('account_id', $user->id)
            ->with('assignee:id,name')
            ->latest('updated_at')
            ->limit(50)
            ->get();

        return response()->json(['data' => ['tickets' => $tickets->map(fn (SupportTicket $ticket) => $this->ticket($ticket))]]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $data = $request->validate([
            'subject' => ['required', 'string', 'max:180'],
            'category' => ['nullable', 'in:general,account,billing,technical,book,audio'],
            'message' => ['required', 'string', 'min:2', 'max:10000'],
        ]);
        $ticket = SupportTicket::query()->create([
            'account_id' => $user->id,
            'subject' => trim($data['subject']),
            'category' => $data['category'] ?? 'general',
            'last_reply_at' => now(),
        ]);
        $ticket->messages()->create(['author_id' => $user->id, 'body' => trim($data['message'])]);

        return response()->json(['data' => ['ticket' => $this->ticket($ticket)]], 201);
    }

    public function show(Request $request, SupportTicket $ticket): JsonResponse
    {
        $this->authorizeTicket($request, $ticket);
        $ticket->load(['assignee:id,name', 'messages' => fn ($query) => $query->where('is_internal', false)->with('author:id,name')->oldest()]);

        return response()->json(['data' => ['ticket' => $this->ticket($ticket, true)]]);
    }

    public function reply(Request $request, SupportTicket $ticket): JsonResponse
    {
        $user = $this->authorizeTicket($request, $ticket);
        abort_if(in_array($ticket->status, ['closed', 'resolved'], true), 422, 'This ticket is closed.');
        $data = $request->validate(['message' => ['required', 'string', 'min:2', 'max:10000']]);
        $message = $ticket->messages()->create(['author_id' => $user->id, 'body' => trim($data['message'])]);
        $ticket->update(['status' => 'open', 'last_reply_at' => now()]);

        return response()->json(['data' => ['message' => $this->message($message->load('author:id,name'))]], 201);
    }

    private function user(Request $request): User
    {
        /** @var User|null $user */
        $user = $request->user();
        abort_unless($user, 401);

        return $user;
    }

    private function authorizeTicket(Request $request, SupportTicket $ticket): User
    {
        $user = $this->user($request);
        abort_unless($ticket->account_id === $user->id, 403);

        return $user;
    }

    private function ticket(SupportTicket $ticket, bool $includeMessages = false): array
    {
        $data = [
            'id' => $ticket->id,
            'subject' => $ticket->subject,
            'category' => $ticket->category,
            'priority' => $ticket->priority,
            'status' => $ticket->status,
            'assignee_name' => $ticket->assignee?->name,
            'last_reply_at' => $ticket->last_reply_at?->toISOString(),
            'closed_at' => $ticket->closed_at?->toISOString(),
            'created_at' => $ticket->created_at?->toISOString(),
            'updated_at' => $ticket->updated_at?->toISOString(),
        ];

        if ($includeMessages) {
            $data['messages'] = $ticket->messages->map(fn (SupportTicketMessage $message) => $this->message($message))->values();
        }

        return $data;
    }

    private function message(SupportTicketMessage $message): array
    {
        return [
            'id' => $message->id,
            'body' => $message->body,
            'author_name' => $message->author?->name ?? 'Support',
            'created_at' => $message->created_at?->toISOString(),
        ];
    }
}
