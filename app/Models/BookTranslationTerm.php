<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookTranslationTerm extends Model
{
    protected $fillable = [
        'book_id',
        'source_term',
        'target_term',
        'target_locale',
        'notes',
    ];

    public function book(): BelongsTo
    {
        return $this->belongsTo(Book::class);
    }
}
