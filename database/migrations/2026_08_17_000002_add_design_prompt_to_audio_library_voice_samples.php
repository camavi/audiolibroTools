<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('audio_library_voice_samples', function (Blueprint $table) {
            $table->text('design_prompt')->nullable()->after('reference_text');
        });
    }

    public function down(): void
    {
        Schema::table('audio_library_voice_samples', function (Blueprint $table) {
            $table->dropColumn('design_prompt');
        });
    }
};
