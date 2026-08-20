<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookEdition extends Model
{
    protected $fillable = ['book_id', 'locale', 'name', 'status', 'is_original', 'metadata_json'];
    protected function casts(): array { return ['is_original' => 'boolean', 'metadata_json' => 'array']; }
    public function book(): BelongsTo { return $this->belongsTo(Book::class); }
}
