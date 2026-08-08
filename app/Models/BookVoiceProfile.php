<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BookVoiceProfile extends Model
{
    protected $fillable = [
        'book_id',
        'name',
        'role',
        'voice_provider',
        'voice_id',
        'language',
        'notes',
        'settings_json',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'settings_json' => 'array',
        ];
    }

    public function book(): BelongsTo
    {
        return $this->belongsTo(Book::class);
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(BookBlockVoiceAssignment::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
