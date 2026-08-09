<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BookAudioJob extends Model
{
    protected $fillable = [
        'book_id',
        'book_block_id',
        'book_block_version_id',
        'book_voice_profile_id',
        'block_uuid',
        'status',
        'provider_key',
        'model',
        'source',
        'request_json',
        'result_json',
        'error_message',
        'started_at',
        'completed_at',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'request_json' => 'array',
            'result_json' => 'array',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
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

    public function segments(): HasMany
    {
        return $this->hasMany(BookAudioSegment::class);
    }
}
