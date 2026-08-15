<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AudioMediaAsset extends Model
{
    protected $fillable = ['account_id', 'kind', 'name', 'description', 'tags', 'audio_path', 'original_name', 'duration_ms'];

    protected function casts(): array
    {
        return ['tags' => 'array'];
    }
}
