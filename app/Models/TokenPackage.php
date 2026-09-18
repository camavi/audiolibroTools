<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TokenPackage extends Model
{
    protected $fillable = ['package_key', 'name', 'description', 'price_cents', 'currency', 'credits', 'is_active', 'sort_order'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }
}
