<?php

namespace Database\Seeders;

use App\Models\BookCategory;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class BookCategorySeeder extends Seeder
{
    /**
     * Populate the fixed, system-provided book categories.
     */
    public function run(): void
    {
        collect([
            'Fiction',
            'Non-fiction',
            'Biography & Memoir',
            'Business & Economics',
            'Children & Young Adult',
            'Education & Reference',
            'Fantasy',
            'History',
            'Mystery & Thriller',
            'Romance',
            'Science Fiction',
            'Self Help',
            'Spirituality & Religion',
            'Travel',
        ])->each(function (string $name): void {
            BookCategory::query()->firstOrCreate(
                ['slug' => Str::slug($name)],
                ['name' => $name],
            );
        });
    }
}
