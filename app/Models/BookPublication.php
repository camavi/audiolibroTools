<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookPublication extends Model
{
    protected $fillable = ['book_id', 'book_edition_id', 'version_number', 'label', 'status', 'is_online', 'snapshot_json', 'epub_file_path', 'pdf_file_path', 'audiobook_file_path', 'published_at', 'created_by'];

    protected function casts(): array
    {
        return ['snapshot_json' => 'array', 'is_online' => 'boolean', 'published_at' => 'datetime'];
    }

    public function book(): BelongsTo
    {
        return $this->belongsTo(Book::class);
    }

    public function edition(): BelongsTo
    {
        return $this->belongsTo(BookEdition::class, 'book_edition_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
