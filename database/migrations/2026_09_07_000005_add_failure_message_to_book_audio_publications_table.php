<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('book_audio_publications', function (Blueprint $table) {
            $table->text('failure_message')->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('book_audio_publications', function (Blueprint $table) {
            $table->dropColumn('failure_message');
        });
    }
};
