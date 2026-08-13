<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookAudioTimelineItem extends Model
{
    protected $fillable = ['book_id', 'book_audio_segment_id', 'track', 'label', 'start_ms', 'duration_ms', 'trim_start_ms', 'trim_end_ms', 'fade_in_ms', 'fade_out_ms', 'volume', 'muted', 'sort_order'];

    protected function casts(): array
    {
        return ['muted' => 'boolean'];
    }

    public function audioSegment(): BelongsTo
    {
        return $this->belongsTo(BookAudioSegment::class, 'book_audio_segment_id');
    }
}
