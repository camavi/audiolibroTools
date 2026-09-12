<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('book_audio_publications', function (Blueprint $table): void {
            $table->string('mp3_status')->default('not_requested')->after('status');
            $table->unsignedTinyInteger('mp3_progress_percent')->default(0)->after('progress_percent');
            $table->text('mp3_failure_message')->nullable()->after('failure_message');
        });
    }

    public function down(): void
    {
        Schema::table('book_audio_publications', function (Blueprint $table): void {
            $table->dropColumn(['mp3_status', 'mp3_progress_percent', 'mp3_failure_message']);
        });
    }
};
