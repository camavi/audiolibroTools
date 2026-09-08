<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('book_audio_timeline_items', function (Blueprint $table): void {
            $table->json('eq_settings_json')->nullable()->after('muted');
        });
    }

    public function down(): void
    {
        Schema::table('book_audio_timeline_items', function (Blueprint $table): void {
            $table->dropColumn('eq_settings_json');
        });
    }
};
