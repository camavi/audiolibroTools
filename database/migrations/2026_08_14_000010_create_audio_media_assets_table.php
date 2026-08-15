<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audio_media_assets', function (Blueprint $table) {
            $table->id();
            // The dashboard supports the local development workspace before
            // authentication is enabled, just like the voice library.
            $table->foreignId('account_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('kind', 20);
            $table->string('name', 160);
            $table->text('description')->nullable();
            $table->json('tags')->nullable();
            $table->string('audio_path');
            $table->string('original_name', 255)->nullable();
            $table->unsignedInteger('duration_ms')->nullable();
            $table->timestamps();
            $table->index(['account_id', 'kind']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audio_media_assets');
    }
};
