<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

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
}
