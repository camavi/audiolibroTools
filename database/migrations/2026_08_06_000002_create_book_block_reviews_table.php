<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('book_block_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_id')->constrained('books')->cascadeOnDelete();
            $table->foreignId('book_block_id')->constrained('book_blocks')->cascadeOnDelete();
            $table->foreignId('book_block_version_id')->constrained('book_block_versions')->cascadeOnDelete();
            $table->string('type', 40)->default('grammar');
            $table->string('status', 40)->default('draft');
            $table->string('source', 40)->default('manual');
            $table->longText('original_text')->nullable();
            $table->longText('suggested_text')->nullable();
            $table->json('notes_json')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['book_id', 'book_block_id']);
            $table->index(['book_block_version_id', 'status']);
            $table->index(['book_block_id', 'type']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('book_block_reviews');
    }
};
