<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('book_blocks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_id')->constrained('books')->cascadeOnDelete();
            $table->string('block_uuid', 64);
            $table->string('type', 40)->default('paragraph');
            $table->unsignedInteger('sort_order')->default(0);
            $table->foreignId('parent_block_id')->nullable()->constrained('book_blocks')->nullOnDelete();
            $table->json('content_json')->nullable();
            $table->longText('text_plain')->nullable();
            $table->string('content_hash', 64)->nullable();
            $table->unsignedBigInteger('current_version_id')->nullable();
            $table->string('status', 30)->default('clean');
            $table->timestamps();

            $table->unique(['book_id', 'block_uuid']);
            $table->index(['book_id', 'sort_order']);
            $table->index(['book_id', 'status']);
            $table->index('content_hash');
            $table->index('current_version_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('book_blocks');
    }
};
