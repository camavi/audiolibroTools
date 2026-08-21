<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BookAudioTimelineItem extends Model
{
    protected $fillable = ['book_id', 'book_edition_id', 'book_audio_segment_id', 'audio_library_voice_sample_id', 'audio_media_asset_id', 'book_audio_job_id', 'parent_timeline_item_id', 'is_group', 'track', 'lane', 'label', 'start_ms', 'duration_ms', 'trim_start_ms', 'trim_end_ms', 'fade_in_ms', 'fade_out_ms', 'volume', 'muted', 'sort_order'];

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

    public function librarySample(): BelongsTo
    {
        return $this->belongsTo(AudioLibraryVoiceSample::class, 'audio_library_voice_sample_id');
    }

    public function mediaAsset(): BelongsTo
    {
        return $this->belongsTo(AudioMediaAsset::class, 'audio_media_asset_id');
    }

    public function parentTimelineItem(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_timeline_item_id');
    }

    public function timelineChildren(): HasMany
    {
        return $this->hasMany(self::class, 'parent_timeline_item_id');
    }
}
