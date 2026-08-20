<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccountCreditLedgerEntry extends Model
{
    protected $fillable = ['account_id', 'book_id', 'book_translation_job_id', 'type', 'credits', 'metadata_json'];

    protected function casts(): array
    {
        return ['metadata_json' => 'array'];
    }

    public function book(): BelongsTo
    {
        return $this->belongsTo(Book::class);
    }
}
