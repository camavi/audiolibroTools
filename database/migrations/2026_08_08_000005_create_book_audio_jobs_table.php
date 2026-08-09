<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('book_audio_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->foreignId('book_block_id')->constrained('book_blocks')->cascadeOnDelete();
            $table->foreignId('book_block_version_id')->constrained('book_block_versions')->cascadeOnDelete();
            $table->foreignId('book_voice_profile_id')->nullable()->constrained('book_voice_profiles')->nullOnDelete();
            $table->string('block_uuid', 64);
            $table->string('status', 30)->default('queued');
            $table->string('provider_key', 80)->default('mock');
            $table->string('model', 120)->nullable();
            $table->string('source', 40)->default('manual');
            $table->json('request_json')->nullable();
            $table->json('result_json')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['book_id', 'block_uuid', 'status']);
            $table->index(['book_block_id', 'book_block_version_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('book_audio_jobs');
    }
};
