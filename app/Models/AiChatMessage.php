<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiChatMessage extends Model
{
    protected $fillable = [
        'ai_chat_thread_id',
        'role',
        'content',
        'source',
        'provider_key',
        'model',
        'metadata_json',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'metadata_json' => 'array',
        ];
    }

    public function thread(): BelongsTo
    {
        return $this->belongsTo(AiChatThread::class, 'ai_chat_thread_id');
    }
}
