<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('book_audio_timeline_items', function (Blueprint $table) {
            $table->unsignedInteger('fade_in_ms')->default(0)->after('trim_end_ms');
            $table->unsignedInteger('fade_out_ms')->default(0)->after('fade_in_ms');
        });
    }

    public function down(): void
    {
        Schema::table('book_audio_timeline_items', function (Blueprint $table) {
            $table->dropColumn(['fade_in_ms', 'fade_out_ms']);
        });
    }
};
