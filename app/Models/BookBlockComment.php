<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookBlockComment extends Model
{
    protected $fillable = [
        'book_id',
        'book_block_id',
        'book_block_version_id',
        'block_uuid',
        'status',
        'body',
        'metadata_json',
        'created_by',
        'resolved_at',
        'resolved_by',
    ];

    protected function casts(): array
    {
        return [
            'metadata_json' => 'array',
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

    public function blockVersion(): BelongsTo
    {
        return $this->belongsTo(BookBlockVersion::class, 'book_block_version_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }
}
