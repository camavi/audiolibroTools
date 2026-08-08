<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_chat_threads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->foreignId('book_block_id')->nullable()->constrained('book_blocks')->nullOnDelete();
            $table->foreignId('book_block_version_id')->nullable()->constrained('book_block_versions')->nullOnDelete();
            $table->string('scope', 40)->default('block');
            $table->string('block_uuid', 80)->nullable();
            $table->string('title', 180)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['book_id', 'scope', 'block_uuid']);
            $table->index(['book_block_version_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_chat_threads');
    }
};
