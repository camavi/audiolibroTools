<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('book_audio_publications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->foreignId('book_edition_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('version_number');
            $table->string('label')->nullable();
            $table->string('status')->default('ready');
            $table->boolean('is_online')->default(true);
            $table->json('timeline_snapshot_json');
            $table->json('masters_json');
            $table->unsignedInteger('duration_ms')->default(0);
            $table->timestamp('published_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['book_edition_id', 'version_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('book_audio_publications');
    }
};
