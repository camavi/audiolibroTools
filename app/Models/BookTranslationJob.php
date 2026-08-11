<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookTranslationJob extends Model
{
    protected $fillable = [
        'book_id',
        'target_locale',
        'status',
        'provider_key',
        'model',
        'total_blocks',
        'completed_blocks',
        'skipped_blocks',
        'failed_blocks',
        'reserved_credits',
        'consumed_credits',
        'released_credits',
        'current_block_uuid',
        'request_json',
        'error_message',
        'started_at',
        'completed_at',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'request_json' => 'array',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function book(): BelongsTo
    {
        return $this->belongsTo(Book::class);
    }
}
