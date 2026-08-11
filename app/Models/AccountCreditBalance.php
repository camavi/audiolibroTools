<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AccountCreditBalance extends Model
{
    protected $fillable = ['account_id', 'available_credits', 'reserved_credits', 'consumed_credits'];
}
