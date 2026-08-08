<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiProviderCredential extends Model
{
    protected $fillable = [
        'account_id',
        'provider_key',
        'api_key',
        'verified_at',
    ];

    protected function casts(): array
    {
        return [
            'api_key' => 'encrypted',
            'verified_at' => 'datetime',
        ];
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(User::class, 'account_id');
    }
}
