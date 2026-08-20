<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('book_editions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->string('locale', 20);
            $table->string('name');
            $table->string('status', 30)->default('draft');
            $table->boolean('is_original')->default(false);
            $table->json('metadata_json')->nullable();
            $table->timestamps();
            $table->unique(['book_id', 'locale']);
        });

        DB::table('books')->orderBy('id')->each(function (object $book) {
            DB::table('book_editions')->insert(['book_id' => $book->id, 'locale' => strtolower($book->lang ?: 'en'), 'name' => $book->name, 'status' => 'ready', 'is_original' => true, 'metadata_json' => json_encode([]), 'created_at' => now(), 'updated_at' => now()]);
        });
    }

    public function down(): void { Schema::dropIfExists('book_editions'); }
};
