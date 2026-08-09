<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookBlockTranslation extends Model
{
    protected $fillable = [
        'book_id',
        'book_block_id',
        'source_book_block_version_id',
        'applied_book_block_version_id',
        'block_uuid',
        'target_locale',
        'status',
        'provider_key',
        'model',
        'source',
        'source_text',
        'translated_text',
        'notes_json',
        'approved_at',
        'resolved_at',
        'resolved_by',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'notes_json' => 'array',
            'approved_at' => 'datetime',
            'resolved_at' => 'datetime',
        ];
    }

    public function book(): BelongsTo
    {
        return $this->belongsTo(Book::class);
    }

    public function block(): BelongsTo
    {
        return $this->belongsTo(BookBlock::class, 'book_block_id');
    }

    public function sourceBlockVersion(): BelongsTo
    {
        return $this->belongsTo(BookBlockVersion::class, 'source_book_block_version_id');
    }

    public function appliedBlockVersion(): BelongsTo
    {
        return $this->belongsTo(BookBlockVersion::class, 'applied_book_block_version_id');
    }

    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
