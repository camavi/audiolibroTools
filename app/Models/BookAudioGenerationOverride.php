<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BookAudioGenerationOverride extends Model
{
    protected $fillable = [
        'book_id', 'book_edition_id', 'book_block_id', 'book_block_version_id', 'block_uuid',
        'original_text', 'generator_text', 'tone_id', 'split_tones_json', 'split_settings_json', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'split_tones_json' => 'array',
            'split_settings_json' => 'array',
        ];
    }
}
