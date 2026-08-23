<?php

namespace App\Services;

use App\Models\AdminAuditLog;
use App\Models\User;
use Illuminate\Http\Request;

class AdminAuditService
{
    /** @param array<string, mixed> $metadata */
    public function record(Request $request, User $account, string $event, array $metadata = []): void
    {
        /** @var User|null $actor */
        $actor = $request->user();

        AdminAuditLog::query()->create([
            'actor_id' => $actor?->id,
            'account_id' => $account->id,
            'event' => $event,
            'metadata_json' => $metadata ?: null,
            'ip_address' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 500) ?: null,
        ]);
    }
}
