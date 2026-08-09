<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('book_audio_segments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->foreignId('book_block_id')->constrained('book_blocks')->cascadeOnDelete();
            $table->foreignId('book_block_version_id')->constrained('book_block_versions')->cascadeOnDelete();
            $table->foreignId('book_voice_profile_id')->nullable()->constrained('book_voice_profiles')->nullOnDelete();
            $table->foreignId('book_audio_job_id')->nullable()->constrained('book_audio_jobs')->nullOnDelete();
            $table->string('block_uuid', 64);
            $table->string('status', 30)->default('completed');
            $table->string('provider_key', 80)->default('mock');
            $table->string('model', 120)->nullable();
            $table->string('voice_id', 160)->nullable();
            $table->string('audio_path')->nullable();
            $table->unsignedInteger('duration_ms')->nullable();
            $table->text('text_plain')->nullable();
            $table->string('content_hash', 128)->nullable();
            $table->json('metadata_json')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['book_id', 'block_uuid', 'status']);
            $table->index(['book_block_id', 'book_block_version_id']);
            $table->index(['book_voice_profile_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('book_audio_segments');
    }
};
