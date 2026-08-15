<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('book_audio_timeline_items', function (Blueprint $table) {
            $table->foreignId('parent_timeline_item_id')
                ->nullable()
                ->after('book_audio_job_id')
                ->constrained('book_audio_timeline_items')
                ->cascadeOnDelete();
            $table->index(['book_id', 'parent_timeline_item_id']);
        });
    }

    public function down(): void
    {
        Schema::table('book_audio_timeline_items', function (Blueprint $table) {
            $table->dropIndex(['book_id', 'parent_timeline_item_id']);
            $table->dropConstrainedForeignId('parent_timeline_item_id');
        });
    }
};
