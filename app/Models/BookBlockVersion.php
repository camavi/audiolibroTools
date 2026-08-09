<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BookBlockVersion extends Model
{
    protected $fillable = [
        'book_block_id',
        'version_number',
        'source',
        'content_json',
        'text_plain',
        'content_hash',
        'diff_json',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'content_json' => 'array',
            'diff_json' => 'array',
        ];
    }

    public function block(): BelongsTo
    {
        return $this->belongsTo(BookBlock::class, 'book_block_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(BookBlockReview::class, 'book_block_version_id');
    }

    public function comments(): HasMany
    {
        return $this->hasMany(BookBlockComment::class, 'book_block_version_id');
    }

    public function voiceAssignments(): HasMany
    {
        return $this->hasMany(BookBlockVoiceAssignment::class, 'book_block_version_id');
    }

    public function audioJobs(): HasMany
    {
        return $this->hasMany(BookAudioJob::class, 'book_block_version_id');
    }

    public function audioSegments(): HasMany
    {
        return $this->hasMany(BookAudioSegment::class, 'book_block_version_id');
    }

    public function sourceTranslations(): HasMany
    {
        return $this->hasMany(BookBlockTranslation::class, 'source_book_block_version_id');
    }

    public function appliedTranslations(): HasMany
    {
        return $this->hasMany(BookBlockTranslation::class, 'applied_book_block_version_id');
    }

    public function aiChatThreads(): HasMany
    {
        return $this->hasMany(AiChatThread::class, 'book_block_version_id');
    }
}
