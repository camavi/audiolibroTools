<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('book_block_voice_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->foreignId('book_block_id')->constrained('book_blocks')->cascadeOnDelete();
            $table->foreignId('book_block_version_id')->constrained('book_block_versions')->cascadeOnDelete();
            $table->foreignId('book_voice_profile_id')->constrained('book_voice_profiles')->cascadeOnDelete();
            $table->string('block_uuid', 64);
            $table->string('source', 40)->default('manual');
            $table->json('metadata_json')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['book_block_id', 'book_block_version_id'], 'book_block_voice_assignment_version_unique');
            $table->index(['book_id', 'block_uuid']);
            $table->index(['book_voice_profile_id', 'book_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('book_block_voice_assignments');
    }
};
