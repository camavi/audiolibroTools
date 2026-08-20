<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookDesignAsset extends Model
{
    protected $fillable = [
        'book_id', 'account_id', 'name', 'image_path', 'mime_type',
        'width', 'height', 'metadata_json', 'created_by',
    ];

    protected function casts(): array
    {
        return ['metadata_json' => 'array'];
    }

    public function book(): BelongsTo
    {
        return $this->belongsTo(Book::class);
    }
}
