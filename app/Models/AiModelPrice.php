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
        'input_price_usd',
        'output_price_usd',
        'unit_price_usd',
    ];

    protected function casts(): array
    {
        return [
            'is_enabled' => 'boolean',
            'is_hidden' => 'boolean',
            'input_price_usd' => 'decimal:6',
            'output_price_usd' => 'decimal:6',
            'unit_price_usd' => 'decimal:6',
        ];
    }
}
