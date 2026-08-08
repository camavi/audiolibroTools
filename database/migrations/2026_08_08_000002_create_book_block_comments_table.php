<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('book_block_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->foreignId('book_block_id')->nullable()->constrained('book_blocks')->nullOnDelete();
            $table->foreignId('book_block_version_id')->nullable()->constrained('book_block_versions')->nullOnDelete();
            $table->string('block_uuid', 64)->nullable();
            $table->string('status', 20)->default('open');
            $table->text('body');
            $table->json('metadata_json')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['book_id', 'block_uuid', 'status']);
            $table->index(['book_block_id', 'book_block_version_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('book_block_comments');
    }
};
