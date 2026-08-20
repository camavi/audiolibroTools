<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AccountCreditBalance extends Model
{
    protected $fillable = ['account_id', 'available_credits', 'reserved_credits', 'consumed_credits', 'auto_recharge_enabled', 'auto_recharge_threshold', 'auto_recharge_amount'];

    protected function casts(): array
    {
        return ['auto_recharge_enabled' => 'boolean'];
    }
}
