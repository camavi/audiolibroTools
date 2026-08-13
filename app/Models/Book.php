<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Book extends Model
{
    protected $fillable = [
        'account_id',
        'key_book',
        'id_file',
        'name',
        'description',
        'categories',
        'lang',
        'cover_img',
    ];

    protected function casts(): array
    {
        return [
            'categories' => 'array',
        ];
    }

    public function blocks(): HasMany
    {
        return $this->hasMany(BookBlock::class)->orderBy('sort_order');
    }

    public function blockReviews(): HasMany
    {
        return $this->hasMany(BookBlockReview::class);
    }

    public function blockComments(): HasMany
    {
        return $this->hasMany(BookBlockComment::class);
    }

    public function voiceProfiles(): HasMany
    {
        return $this->hasMany(BookVoiceProfile::class);
    }

    public function blockVoiceAssignments(): HasMany
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

    public function audioTimelineItems(): HasMany
    {
        return $this->hasMany(BookAudioTimelineItem::class);
    }

    public function blockTranslations(): HasMany
    {
        return $this->hasMany(BookBlockTranslation::class);
    }

    public function translationTerms(): HasMany
    {
        return $this->hasMany(BookTranslationTerm::class);
    }

    public function translationJobs(): HasMany
    {
        return $this->hasMany(BookTranslationJob::class);
    }

    public function aiChatThreads(): HasMany
    {
        return $this->hasMany(AiChatThread::class);
    }
}
