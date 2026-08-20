<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookDistributionConnection extends Model
{
    protected $fillable = ['book_id', 'account_id', 'provider_key', 'account_label', 'api_token', 'status', 'connected_at', 'last_published_at', 'metadata_json'];
    protected function casts(): array { return ['api_token' => 'encrypted', 'connected_at' => 'datetime', 'last_published_at' => 'datetime', 'metadata_json' => 'array']; }
    public function book(): BelongsTo { return $this->belongsTo(Book::class); }
}
