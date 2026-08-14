<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audio_library_voices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('name', 160);
            $table->string('type', 20)->default('female');
            $table->string('language', 20);
            $table->text('description')->nullable();
            $table->string('provider', 80)->nullable();
            $table->string('provider_voice_id', 160)->nullable();
            $table->timestamps();
            $table->index(['account_id', 'name']);
        });

        Schema::create('audio_library_voice_samples', function (Blueprint $table) {
            $table->id();
            $table->foreignId('audio_library_voice_id')->constrained()->cascadeOnDelete();
            $table->string('tone', 60);
            $table->text('description')->nullable();
            $table->string('audio_path');
            $table->string('original_name', 255)->nullable();
            $table->unsignedInteger('duration_ms')->nullable();
            $table->timestamps();
            $table->index(['audio_library_voice_id', 'tone']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audio_library_voice_samples');
        Schema::dropIfExists('audio_library_voices');
    }
};
