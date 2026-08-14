<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookAudioSegment extends Model
{
    protected $fillable = [
        'book_id',
        'book_block_id',
        'book_block_version_id',
        'book_voice_profile_id',
        'book_audio_job_id',
        'block_uuid',
        'status',
        'provider_key',
        'model',
        'voice_id',
        'audio_path',
        'duration_ms',
        'segment_index',
        'source_start',
        'source_end',
        'pause_after_ms',
        'text_plain',
        'content_hash',
        'metadata_json',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'metadata_json' => 'array',
        ];
    }

    public function book(): BelongsTo
    {
        return $this->belongsTo(Book::class);
    }

    public function block(): BelongsTo
    {
        return $this->belongsTo(BookBlock::class, 'book_block_id');
    }

    public function blockVersion(): BelongsTo
    {
        return $this->belongsTo(BookBlockVersion::class, 'book_block_version_id');
    }

    public function voiceProfile(): BelongsTo
    {
        return $this->belongsTo(BookVoiceProfile::class, 'book_voice_profile_id');
    }

    public function audioJob(): BelongsTo
    {
        return $this->belongsTo(BookAudioJob::class, 'book_audio_job_id');
    }
}
