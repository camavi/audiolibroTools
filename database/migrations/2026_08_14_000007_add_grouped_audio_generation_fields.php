<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('books', function (Blueprint $table) {
            $table->json('audio_settings_json')->nullable()->after('cover_img');
        });
        Schema::table('book_audio_segments', function (Blueprint $table) {
            $table->unsignedInteger('segment_index')->default(0)->after('duration_ms');
            $table->unsignedInteger('source_start')->default(0)->after('segment_index');
            $table->unsignedInteger('source_end')->default(0)->after('source_start');
            $table->unsignedInteger('pause_after_ms')->default(0)->after('source_end');
        });
        Schema::table('book_audio_timeline_items', function (Blueprint $table) {
            $table->foreignId('book_audio_job_id')->nullable()->after('book_audio_segment_id')->constrained()->nullOnDelete();
            $table->boolean('is_group')->default(false)->after('book_audio_job_id');
        });
    }

    public function down(): void
    {
        Schema::table('book_audio_timeline_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('book_audio_job_id');
            $table->dropColumn('is_group');
        });
        Schema::table('book_audio_segments', function (Blueprint $table) {
            $table->dropColumn(['segment_index', 'source_start', 'source_end', 'pause_after_ms']);
        });
        Schema::table('books', function (Blueprint $table) {
            $table->dropColumn('audio_settings_json');
        });
    }
};
