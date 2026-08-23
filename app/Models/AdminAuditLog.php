<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['actor_id', 'account_id', 'event', 'metadata_json', 'ip_address', 'user_agent'])]
class AdminAuditLog extends Model
{
    protected function casts(): array
    {
        return ['metadata_json' => 'array'];
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(User::class, 'account_id');
    }
}
