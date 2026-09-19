<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SubscriptionCreditGrant extends Model
{
    protected $fillable = ['account_subscription_id', 'user_id', 'credits', 'period_starts_at', 'granted_at', 'metadata_json'];

    protected function casts(): array
    {
        return ['period_starts_at' => 'datetime', 'granted_at' => 'datetime', 'metadata_json' => 'array'];
    }

    public function subscription(): BelongsTo { return $this->belongsTo(AccountSubscription::class, 'account_subscription_id'); }
}
