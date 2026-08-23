<?php

namespace App\Http\Controllers;

use App\Models\AccountCreditBalance;
use App\Models\AccountCreditLedgerEntry;
use App\Models\Book;
use App\Models\BookAudioJob;
use App\Models\BookTranslationJob;
use App\Models\SupportTicket;
use App\Models\SupportTicketMessage;
use App\Models\User;
use App\Services\AdminAuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;

class AdminSupportController extends Controller
{
    public function __construct(private readonly AdminAuditService $audit)
    {
    }

    public function users(Request $request): JsonResponse
    {
        $data = $request->validate(['search' => ['nullable', 'string', 'max:120'], 'page' => ['nullable', 'integer', 'min:1']]);
        $search = trim((string) ($data['search'] ?? ''));
        $users = User::query()
            ->when($search !== '', fn ($query) => $query->where(fn ($query) => $query->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%")))
            ->withCount(['supportTickets as open_tickets_count' => fn ($query) => $query->whereNotIn('status', ['closed', 'resolved'])])
            ->latest()
            ->paginate(30);

        return response()->json(['data' => [
            'users' => collect($users->items())->map(fn (User $user) => $this->user($user))->values(),
            'pagination' => ['page' => $users->currentPage(), 'last_page' => $users->lastPage(), 'total' => $users->total()],
        ]]);
    }

    public function userDetail(User $user): JsonResponse
    {
        $tickets = $user->supportTickets()->latest('updated_at')->limit(20)->get();
        $books = Book::query()->where('account_id', $user->id)->latest()->get();
        $bookIds = $books->pluck('id');
        $failures = BookAudioJob::query()->whereIn('book_id', $bookIds)->where('status', 'failed')->latest()->limit(10)->get(['id', 'book_id', 'status', 'error_message', 'created_at'])
            ->concat(BookTranslationJob::query()->whereIn('book_id', $bookIds)->where('status', 'failed')->latest()->limit(10)->get(['id', 'book_id', 'status', 'error_message', 'created_at']))
            ->sortByDesc('created_at')->take(10)->values();
        $balance = AccountCreditBalance::query()->where('account_id', $user->id)->first();

        return response()->json(['data' => [
            'user' => $this->user($user),
            'tickets' => $tickets->map(fn (SupportTicket $ticket) => $this->ticket($ticket))->values(),
            'books' => $books->map(fn (Book $book) => $this->book($book))->values(),
            'credits' => ['available' => (int) ($balance?->available_credits ?? 0), 'reserved' => (int) ($balance?->reserved_credits ?? 0), 'consumed' => (int) ($balance?->consumed_credits ?? 0)],
            'failures' => $failures->map(fn ($job) => ['id' => $job->id, 'book_id' => $job->book_id, 'error_message' => $job->error_message, 'created_at' => $job->created_at?->toISOString()])->values(),
        ]]);
    }

    public function updateUser(Request $request, User $user): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        abort_if($actor->is($user), 422, 'You cannot change your own administrator role.');
        $data = $request->validate(['role' => ['required', 'in:user,support,admin']]);
        $previousRole = $user->role;
        $user->update(['role' => $data['role']]);
        $this->audit->record($request, $user, 'admin.user.role_updated', ['from' => $previousRole, 'to' => $user->role]);

        return response()->json(['data' => ['user' => $this->user($user->fresh())]]);
    }

    public function updateAccountStatus(Request $request, User $user): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        abort_if($actor->is($user), 422, 'You cannot restrict your own administrator account.');
        $data = $request->validate(['account_status' => ['required', 'in:active,suspended,blocked'], 'reason' => ['nullable', 'string', 'max:500']]);
        abort_if($data['account_status'] !== 'active' && blank($data['reason']), 422, 'A reason is required when restricting an account.');
        $user->update([
            'account_status' => $data['account_status'],
            'restriction_reason' => $data['account_status'] === 'active' ? null : trim((string) $data['reason']),
            'restricted_at' => $data['account_status'] === 'active' ? null : now(),
            'restricted_by' => $data['account_status'] === 'active' ? null : $actor->id,
        ]);
        $this->audit->record($request, $user, 'admin.user.status_updated', ['status' => $user->account_status]);

        return response()->json(['data' => ['user' => $this->user($user->fresh())]]);
    }

    public function adjustCredits(Request $request, User $user): JsonResponse
    {
        $data = $request->validate(['credits' => ['required', 'integer', 'between:-100000,100000', 'not_in:0'], 'reason' => ['required', 'string', 'max:500']]);
        $balance = DB::transaction(function () use ($user, $data): AccountCreditBalance {
            AccountCreditBalance::query()->firstOrCreate(['account_id' => $user->id], ['available_credits' => 0, 'reserved_credits' => 0, 'consumed_credits' => 0]);
            $balance = AccountCreditBalance::query()->where('account_id', $user->id)->lockForUpdate()->firstOrFail();
            abort_if($data['credits'] < 0 && $balance->available_credits < abs($data['credits']), 422, 'The account does not have enough available credits.');
            $balance->increment('available_credits', $data['credits']);
            AccountCreditLedgerEntry::query()->create(['account_id' => $user->id, 'type' => 'admin_adjustment', 'credits' => $data['credits'], 'metadata_json' => ['reason' => trim($data['reason'])]]);

            return $balance->fresh();
        });
        $this->audit->record($request, $user, 'admin.user.credits_adjusted', ['credits' => $data['credits'], 'reason' => trim($data['reason'])]);

        return response()->json(['data' => ['available_credits' => $balance->available_credits]]);
    }

    public function sendPasswordReset(Request $request, User $user): JsonResponse
    {
        $status = Password::sendResetLink(['email' => $user->email]);
        abort_unless($status === Password::RESET_LINK_SENT, 422, 'Unable to send the password reset email.');
        $this->audit->record($request, $user, 'admin.user.password_reset_sent');

        return response()->json(['data' => ['message' => 'Password reset email sent.']]);
    }

    public function moderateBook(Request $request, User $user, Book $book): JsonResponse
    {
        abort_unless($book->account_id === $user->id, 404);
        /** @var User $actor */
        $actor = $request->user();
        $data = $request->validate(['moderation_status' => ['required', 'in:active,suspended'], 'reason' => ['nullable', 'string', 'max:500']]);
        abort_if($data['moderation_status'] === 'suspended' && blank($data['reason']), 422, 'A reason is required when suspending a book.');
        $book->update(['moderation_status' => $data['moderation_status'], 'moderation_reason' => $data['moderation_status'] === 'active' ? null : trim((string) $data['reason']), 'moderated_at' => $data['moderation_status'] === 'active' ? null : now(), 'moderated_by' => $data['moderation_status'] === 'active' ? null : $actor->id]);
        $this->audit->record($request, $user, 'admin.book.moderated', ['book_id' => $book->id, 'status' => $book->moderation_status]);

        return response()->json(['data' => ['book' => $this->book($book->fresh())]]);
    }

    public function sendCopyrightNotice(Request $request, User $user): JsonResponse
    {
        $data = $request->validate(['book_id' => ['nullable', 'integer', 'exists:books,id'], 'message' => ['required', 'string', 'max:10000']]);
        $book = isset($data['book_id']) ? Book::query()->where('account_id', $user->id)->findOrFail($data['book_id']) : null;
        $ticket = SupportTicket::query()->create(['account_id' => $user->id, 'subject' => $book ? "Copyright notice: {$book->name}" : 'Copyright notice', 'category' => 'copyright', 'priority' => 'high', 'status' => 'pending', 'last_reply_at' => now()]);
        $ticket->messages()->create(['author_id' => $request->user()->id, 'body' => trim($data['message'])]);
        $this->audit->record($request, $user, 'admin.copyright_notice_sent', ['ticket_id' => $ticket->id, 'book_id' => $book?->id]);

        return response()->json(['data' => ['ticket_id' => $ticket->id]], 201);
    }

    public function tickets(Request $request): JsonResponse
    {
        $data = $request->validate(['status' => ['nullable', 'in:open,pending,resolved,closed'], 'assigned' => ['nullable', 'boolean']]);
        $tickets = SupportTicket::query()
            ->with(['account:id,name,email', 'assignee:id,name'])
            ->when(isset($data['status']), fn ($query) => $query->where('status', $data['status']))
            ->when(($data['assigned'] ?? null) === true, fn ($query) => $query->whereNotNull('assigned_to'))
            ->when(($data['assigned'] ?? null) === false, fn ($query) => $query->whereNull('assigned_to'))
            ->latest('updated_at')
            ->paginate(50);

        return response()->json(['data' => [
            'tickets' => collect($tickets->items())->map(fn (SupportTicket $ticket) => $this->ticket($ticket, true))->values(),
            'pagination' => ['page' => $tickets->currentPage(), 'last_page' => $tickets->lastPage(), 'total' => $tickets->total()],
        ]]);
    }

    public function showTicket(SupportTicket $ticket): JsonResponse
    {
        $ticket->load(['account:id,name,email,role', 'assignee:id,name', 'messages.author:id,name']);

        return response()->json(['data' => ['ticket' => $this->ticket($ticket, true, true)]]);
    }

    public function updateTicket(Request $request, SupportTicket $ticket): JsonResponse
    {
        $data = $request->validate([
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'priority' => ['nullable', 'in:low,normal,high,urgent'],
            'status' => ['nullable', 'in:open,pending,resolved,closed'],
        ]);
        if (array_key_exists('assigned_to', $data) && $data['assigned_to']) {
            $assignee = User::query()->findOrFail($data['assigned_to']);
            abort_unless($assignee->isStaff(), 422, 'The assignee must be a staff user.');
        }
        if (array_key_exists('status', $data)) {
            $data['closed_at'] = in_array($data['status'], ['resolved', 'closed'], true) ? now() : null;
        }
        $ticket->fill($data)->save();
        $this->audit->record($request, $ticket->account, 'support.ticket.updated', ['ticket_id' => $ticket->id, 'changes' => array_keys($data)]);

        return response()->json(['data' => ['ticket' => $this->ticket($ticket->fresh()->load(['account:id,name,email', 'assignee:id,name']), true)]]);
    }

    public function reply(Request $request, SupportTicket $ticket): JsonResponse
    {
        $data = $request->validate([
            'message' => ['required', 'string', 'min:2', 'max:10000'],
            'is_internal' => ['nullable', 'boolean'],
        ]);
        /** @var User $author */
        $author = $request->user();
        $message = $ticket->messages()->create([
            'author_id' => $author->id,
            'body' => trim($data['message']),
            'is_internal' => $data['is_internal'] ?? false,
        ]);
        $ticket->update(['status' => 'pending', 'last_reply_at' => now()]);
        $this->audit->record($request, $ticket->account, 'support.ticket.replied', ['ticket_id' => $ticket->id, 'internal' => $message->is_internal]);

        return response()->json(['data' => ['message' => $this->message($message->load('author:id,name'))]], 201);
    }

    private function user(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'account_status' => $user->account_status,
            'restriction_reason' => $user->restriction_reason,
            'open_tickets_count' => $user->open_tickets_count ?? 0,
            'created_at' => $user->created_at?->toISOString(),
        ];
    }

    private function book(Book $book): array
    {
        return ['id' => $book->id, 'name' => $book->name, 'key_book' => $book->key_book, 'moderation_status' => $book->moderation_status, 'moderation_reason' => $book->moderation_reason];
    }

    private function ticket(SupportTicket $ticket, bool $includeAccount = false, bool $includeMessages = false): array
    {
        $data = [
            'id' => $ticket->id,
            'subject' => $ticket->subject,
            'category' => $ticket->category,
            'priority' => $ticket->priority,
            'status' => $ticket->status,
            'assignee' => $ticket->assignee ? ['id' => $ticket->assignee->id, 'name' => $ticket->assignee->name] : null,
            'last_reply_at' => $ticket->last_reply_at?->toISOString(),
            'closed_at' => $ticket->closed_at?->toISOString(),
            'created_at' => $ticket->created_at?->toISOString(),
            'updated_at' => $ticket->updated_at?->toISOString(),
        ];
        if ($includeAccount) {
            $data['account'] = $ticket->account ? ['id' => $ticket->account->id, 'name' => $ticket->account->name, 'email' => $ticket->account->email, 'role' => $ticket->account->role] : null;
        }
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
            'is_internal' => $message->is_internal,
            'author_name' => $message->author?->name ?? 'Deleted user',
            'created_at' => $message->created_at?->toISOString(),
        ];
    }
}
