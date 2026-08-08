<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AiChatThread extends Model
{
    protected $fillable = [
        'book_id',
        'book_block_id',
        'book_block_version_id',
        'scope',
        'block_uuid',
        'title',
        'created_by',
    ];

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

    public function messages(): HasMany
    {
        return $this->hasMany(AiChatMessage::class);
    }
}
