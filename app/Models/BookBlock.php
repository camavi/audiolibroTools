<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BookBlock extends Model
{
    protected $fillable = [
        'book_id',
        'block_uuid',
        'type',
        'sort_order',
        'parent_block_id',
        'content_json',
        'text_plain',
        'content_hash',
        'current_version_id',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'content_json' => 'array',
        ];
    }

    public function book(): BelongsTo
    {
        return $this->belongsTo(Book::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_block_id');
    }

    public function versions(): HasMany
    {
        return $this->hasMany(BookBlockVersion::class);
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(BookBlockReview::class);
    }

    public function comments(): HasMany
    {
        return $this->hasMany(BookBlockComment::class);
    }

    public function voiceAssignments(): HasMany
    {
        return $this->hasMany(BookBlockVoiceAssignment::class);
    }

    public function audioJobs(): HasMany
    {
        return $this->hasMany(BookAudioJob::class);
    }

    public function audioSegments(): HasMany
    {
        return $this->hasMany(BookAudioSegment::class);
    }

    public function currentVersion(): BelongsTo
    {
        return $this->belongsTo(BookBlockVersion::class, 'current_version_id');
    }
}
