<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AudioLibraryTone extends Model
{
    protected $fillable = ['id', 'name', 'description', 'color', 'enabled'];

    protected function casts(): array
    {
        return ['enabled' => 'boolean'];
    }

    public function samples(): HasMany
    {
        return $this->hasMany(AudioLibraryVoiceSample::class, 'tone_id');
    }
}
