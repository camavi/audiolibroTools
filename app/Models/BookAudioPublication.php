<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BookAudioPublication extends Model
{
    protected $fillable = ['book_id', 'book_edition_id', 'version_number', 'label', 'status', 'failure_message', 'is_online', 'timeline_snapshot_json', 'masters_json', 'duration_ms', 'published_at', 'created_by'];

    protected function casts(): array
    {
        return ['is_online' => 'boolean', 'timeline_snapshot_json' => 'array', 'masters_json' => 'array', 'published_at' => 'datetime'];
    }
}
