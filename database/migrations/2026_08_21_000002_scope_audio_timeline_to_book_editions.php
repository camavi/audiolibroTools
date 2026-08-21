<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('book_audio_timeline_items', function (Blueprint $table) {
            $table->foreignId('book_edition_id')->nullable()->after('book_id')->constrained('book_editions')->nullOnDelete();
            $table->index(['book_edition_id', 'track', 'sort_order']);
        });

        DB::table('book_editions')->where('is_original', true)->orderBy('id')->each(function (object $edition): void {
            DB::table('book_audio_timeline_items')->where('book_id', $edition->book_id)->whereNull('book_edition_id')->update(['book_edition_id' => $edition->id]);
        });
    }

    public function down(): void
    {
        Schema::table('book_audio_timeline_items', function (Blueprint $table) {
            $table->dropIndex(['book_edition_id', 'track', 'sort_order']);
            $table->dropConstrainedForeignId('book_edition_id');
        });
    }
};
