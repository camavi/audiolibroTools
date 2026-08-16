<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AudioLibraryVoiceSample extends Model
{
    protected $fillable = ['audio_library_voice_id', 'tone_id', 'tone', 'description', 'audio_path', 'original_name', 'duration_ms', 'provider_voice_id'];

    public function voice(): BelongsTo
    {
        return $this->belongsTo(AudioLibraryVoice::class, 'audio_library_voice_id');
    }

    public function toneDefinition(): BelongsTo
    {
        return $this->belongsTo(AudioLibraryTone::class, 'tone_id');
    }
}
