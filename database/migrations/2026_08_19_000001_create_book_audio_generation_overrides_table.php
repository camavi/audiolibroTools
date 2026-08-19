<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('book_audio_generation_overrides', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->foreignId('book_block_id')->constrained()->cascadeOnDelete();
            $table->foreignId('book_block_version_id')->constrained()->cascadeOnDelete();
            $table->string('block_uuid', 80);
            $table->longText('original_text');
            $table->longText('generator_text');
            $table->foreignId('tone_id')->nullable()->constrained('audio_library_tones')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique('book_block_version_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('book_audio_generation_overrides');
    }
};
