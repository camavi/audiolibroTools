<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('book_translation_terms', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->string('source_term', 180);
            $table->string('target_term', 180);
            $table->string('target_locale', 20);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['book_id', 'source_term', 'target_locale'], 'book_translation_terms_unique_term_locale');
            $table->index(['book_id', 'target_locale']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('book_translation_terms');
    }
};
