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
        'moderation_status',
        'moderation_reason',
        'moderated_at',
        'moderated_by',
        'audio_settings_json',
        'book_design_json',
        'epub_settings_json',
        'epub_file_path',
        'epub_generated_at',
        'pdf_settings_json',
        'pdf_file_path',
        'pdf_generated_at',
    ];

    protected function casts(): array
    {
        return [
            'categories' => 'array',
            'audio_settings_json' => 'array',
            'book_design_json' => 'array',
            'epub_settings_json' => 'array',
            'epub_generated_at' => 'datetime',
            'pdf_settings_json' => 'array',
            'pdf_generated_at' => 'datetime',
            'moderated_at' => 'datetime',
        ];
    }

    public function blocks(): HasMany
    {
        return $this->hasMany(BookBlock::class)->orderBy('sort_order');
    }

    public function designAssets(): HasMany
    {
        return $this->hasMany(BookDesignAsset::class);
    }

    public function mediaAssets(): HasMany
    {
        return $this->hasMany(BookMediaAsset::class);
    }

    public function distributionConnections(): HasMany
    {
        return $this->hasMany(BookDistributionConnection::class);
    }

    public function editions(): HasMany
    {
        return $this->hasMany(BookEdition::class);
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
