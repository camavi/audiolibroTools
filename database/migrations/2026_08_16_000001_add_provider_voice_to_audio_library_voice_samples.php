<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('audio_library_voice_samples', function (Blueprint $table) {
            $table->string('provider_voice_id', 160)->nullable()->after('duration_ms');
        });
    }

    public function down(): void
    {
        Schema::table('audio_library_voice_samples', function (Blueprint $table) {
            $table->dropColumn('provider_voice_id');
        });
    }
};
