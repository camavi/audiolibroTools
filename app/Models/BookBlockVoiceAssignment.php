<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookBlockVoiceAssignment extends Model
{
    protected $fillable = [
        'book_id',
        'book_edition_id',
        'book_block_id',
        'book_block_version_id',
        'book_voice_profile_id',
        'block_uuid',
        'source',
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

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
