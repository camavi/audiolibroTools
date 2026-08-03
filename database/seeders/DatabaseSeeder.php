<?php

namespace Database\Seeders;

use App\Models\BookCategory;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // User::factory(10)->create();

        User::query()->firstOrCreate([
            'email' => 'test@example.com',
        ], [
            'name' => 'Test User',
            'password' => bcrypt('password'),
        ]);

        collect([
            'Fiction',
            'Non-fiction',
            'Biography',
            'Business',
            'Education',
            'Fantasy',
            'Science Fiction',
            'Self Help',
        ])->each(fn (string $name) => BookCategory::query()->firstOrCreate([
            'slug' => Str::slug($name),
        ], [
            'name' => $name,
        ]));
    }
}
