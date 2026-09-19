<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AccountSubscription extends Model
{
    protected $fillable = ['user_id', 'subscription_plan_id', 'provider', 'provider_subscription_id', 'status', 'plan_name', 'monthly_price_cents', 'currency', 'monthly_credits', 'current_period_starts_at', 'current_period_ends_at', 'cancel_at_period_end', 'cancelled_at', 'metadata_json'];

    protected function casts(): array
    {
        return ['current_period_starts_at' => 'datetime', 'current_period_ends_at' => 'datetime', 'cancel_at_period_end' => 'boolean', 'cancelled_at' => 'datetime', 'metadata_json' => 'array'];
    }

    public function plan(): BelongsTo { return $this->belongsTo(SubscriptionPlan::class, 'subscription_plan_id'); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function grants(): HasMany { return $this->hasMany(SubscriptionCreditGrant::class); }
}
