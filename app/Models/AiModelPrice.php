<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AiModelPrice extends Model
{
    protected $fillable = [
        'provider_key',
        'provider_name',
        'model',
        'modality',
        'pricing_unit',
        'is_enabled',
        'is_hidden',
        'input_tokens',
        'output_tokens',
        'customer_credits',
    ];

    protected function casts(): array
    {
        return [
            'is_enabled' => 'boolean',
            'is_hidden' => 'boolean',
        ];
    }
}
