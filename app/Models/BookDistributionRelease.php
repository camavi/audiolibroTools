<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BookDistributionRelease extends Model
{
    protected $fillable = ['book_id', 'book_distribution_connection_id', 'provider_key', 'book_publication_id', 'book_audio_publication_id', 'status', 'package_json', 'failure_message', 'external_reference', 'published_at', 'created_by'];
    protected function casts(): array { return ['package_json' => 'array', 'published_at' => 'datetime']; }
    public function book() { return $this->belongsTo(Book::class); }
}
