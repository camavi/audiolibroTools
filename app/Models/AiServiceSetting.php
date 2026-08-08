<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiServiceSetting extends Model
{
    protected $fillable = [
        'account_id',
        'book_id',
        'service',
        'ai_provider_id',
        'provider_key',
        'model',
        'options_json',
    ];

    protected function casts(): array
    {
        return [
            'options_json' => 'array',
        ];
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(User::class, 'account_id');
    }

    public function book(): BelongsTo
    {
        return $this->belongsTo(Book::class);
    }

    public function provider(): BelongsTo
    {
        return $this->belongsTo(AiProvider::class, 'ai_provider_id');
    }
}
