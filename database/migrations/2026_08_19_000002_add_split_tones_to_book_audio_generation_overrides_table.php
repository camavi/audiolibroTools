<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('book_audio_generation_overrides', function (Blueprint $table) {
            $table->json('split_tones_json')->nullable()->after('tone_id');
        });
    }

    public function down(): void
    {
        Schema::table('book_audio_generation_overrides', function (Blueprint $table) {
            $table->dropColumn('split_tones_json');
        });
    }
};
