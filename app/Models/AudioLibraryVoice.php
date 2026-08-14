<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AudioLibraryVoice extends Model
{
    protected $fillable = ['account_id', 'name', 'type', 'language', 'description', 'provider', 'provider_voice_id'];

    public function samples(): HasMany
    {
        return $this->hasMany(AudioLibraryVoiceSample::class);
    }
}
