<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('book_audio_timeline_items', function (Blueprint $table) {
            $table->foreignId('audio_media_asset_id')->nullable()->after('audio_library_voice_sample_id')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('book_audio_timeline_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('audio_media_asset_id');
        });
    }
};
