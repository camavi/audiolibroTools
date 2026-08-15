<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('book_audio_timeline_items', function (Blueprint $table) {
            $table->unsignedTinyInteger('lane')->default(0)->after('track');
            $table->index(['book_id', 'track', 'lane', 'start_ms']);
        });
    }

    public function down(): void
    {
        Schema::table('book_audio_timeline_items', function (Blueprint $table) {
            $table->dropIndex(['book_id', 'track', 'lane', 'start_ms']);
            $table->dropColumn('lane');
        });
    }
};
