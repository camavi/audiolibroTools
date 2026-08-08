<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiProvider extends Model
{
    protected $fillable = [
        'account_id',
        'provider_key',
        'name',
        'base_url',
        'models_json',
        'default_model',
        'is_custom',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'models_json' => 'array',
            'is_custom' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(User::class, 'account_id');
    }
}
