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
}
