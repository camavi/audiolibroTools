<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookAudioPublication extends Model
{
    protected $fillable = ['book_id', 'book_edition_id', 'version_number', 'label', 'status', 'progress_percent', 'mp3_status', 'mp3_progress_percent', 'failure_message', 'mp3_failure_message', 'is_online', 'timeline_snapshot_json', 'masters_json', 'duration_ms', 'started_at', 'completed_at', 'published_at', 'created_by'];

    protected function casts(): array
    {
        return ['is_online' => 'boolean', 'timeline_snapshot_json' => 'array', 'masters_json' => 'array', 'started_at' => 'datetime', 'completed_at' => 'datetime', 'published_at' => 'datetime'];
    }

    public function book(): BelongsTo
    {
        return $this->belongsTo(Book::class);
    }
}
