<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookAudioTimelineItem extends Model
{
    protected $fillable = ['book_id', 'book_audio_segment_id', 'book_audio_job_id', 'is_group', 'track', 'label', 'start_ms', 'duration_ms', 'trim_start_ms', 'trim_end_ms', 'fade_in_ms', 'fade_out_ms', 'volume', 'muted', 'sort_order'];

    protected function casts(): array
    {
        return ['muted' => 'boolean', 'is_group' => 'boolean'];
    }

    public function audioSegment(): BelongsTo
    {
        return $this->belongsTo(BookAudioSegment::class, 'book_audio_segment_id');
    }

    public function audioJob(): BelongsTo
    {
        return $this->belongsTo(BookAudioJob::class, 'book_audio_job_id');
    }
}
