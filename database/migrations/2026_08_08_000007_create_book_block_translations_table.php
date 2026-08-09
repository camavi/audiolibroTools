<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('book_block_translations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->foreignId('book_block_id')->constrained('book_blocks')->cascadeOnDelete();
            $table->foreignId('source_book_block_version_id')->constrained('book_block_versions')->cascadeOnDelete();
            $table->foreignId('applied_book_block_version_id')->nullable()->constrained('book_block_versions')->nullOnDelete();
            $table->string('block_uuid', 64);
            $table->string('target_locale', 20);
            $table->string('status', 30)->default('draft');
            $table->string('provider_key', 80)->default('mock');
            $table->string('model', 120)->nullable();
            $table->string('source', 40)->default('mock');
            $table->text('source_text')->nullable();
            $table->text('translated_text')->nullable();
            $table->json('notes_json')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['book_id', 'block_uuid', 'target_locale']);
            $table->index(['book_block_id', 'source_book_block_version_id', 'status'], 'book_block_translations_source_status_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('book_block_translations');
    }
};
