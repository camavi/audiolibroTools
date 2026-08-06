<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('book_block_versions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_block_id')->constrained('book_blocks')->cascadeOnDelete();
            $table->unsignedInteger('version_number');
            $table->string('source', 40)->default('manual');
            $table->json('content_json')->nullable();
            $table->longText('text_plain')->nullable();
            $table->string('content_hash', 64);
            $table->json('diff_json')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['book_block_id', 'version_number']);
            $table->index(['book_block_id', 'content_hash']);
            $table->index(['book_block_id', 'source']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('book_block_versions');
    }
};
