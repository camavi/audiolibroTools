<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('book_audio_publications', function (Blueprint $table): void {
            $table->unsignedTinyInteger('progress_percent')->default(0)->after('status');
            $table->timestamp('started_at')->nullable()->after('failure_message');
            $table->timestamp('completed_at')->nullable()->after('started_at');
        });
    }

    public function down(): void
    {
        Schema::table('book_audio_publications', function (Blueprint $table): void {
            $table->dropColumn(['progress_percent', 'started_at', 'completed_at']);
        });
    }
};
