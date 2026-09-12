<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BookCorrectionJob extends Model
{
    protected $fillable = [
        'book_id',
        'status',
        'provider_key',
        'model',
        'total_blocks',
        'completed_blocks',
        'skipped_blocks',
        'failed_blocks',
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

    public function failures(): HasMany
    {
        return $this->hasMany(BookCorrectionJobFailure::class);
    }
}
