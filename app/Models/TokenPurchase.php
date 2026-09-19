<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TokenPurchase extends Model
{
    protected $fillable = [
        'user_id', 'token_package_id', 'provider', 'provider_checkout_session_id',
        'provider_payment_intent_id', 'amount_cents', 'currency', 'credits', 'status',
        'metadata_json', 'paid_at', 'credited_at',
    ];

    protected function casts(): array
    {
        return ['metadata_json' => 'array', 'paid_at' => 'datetime', 'credited_at' => 'datetime'];
    }

    public function tokenPackage(): BelongsTo
    {
        return $this->belongsTo(TokenPackage::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
