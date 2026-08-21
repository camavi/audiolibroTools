<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('book_block_voice_assignments', function (Blueprint $table) {
            $table->foreignId('book_edition_id')->nullable()->after('book_id')->constrained('book_editions')->nullOnDelete();
            $table->dropUnique('book_block_voice_assignment_version_unique');
            $table->unique(['book_block_id', 'book_block_version_id', 'book_edition_id'], 'book_block_voice_assignment_edition_unique');
        });
        foreach (['book_audio_jobs', 'book_audio_segments', 'book_audio_generation_overrides'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->foreignId('book_edition_id')->nullable()->after('book_id')->constrained('book_editions')->nullOnDelete();
                $table->index(['book_edition_id', 'book_block_version_id']);
            });
        }
        Schema::table('book_audio_generation_overrides', function (Blueprint $table) {
            $table->dropUnique(['book_block_version_id']);
            $table->unique(['book_block_version_id', 'book_edition_id'], 'book_audio_override_edition_unique');
        });
        DB::table('book_editions')->where('is_original', true)->orderBy('id')->each(function (object $edition): void {
            foreach (['book_block_voice_assignments', 'book_audio_jobs', 'book_audio_segments', 'book_audio_generation_overrides'] as $tableName) {
                DB::table($tableName)->where('book_id', $edition->book_id)->whereNull('book_edition_id')->update(['book_edition_id' => $edition->id]);
            }
        });
    }

    public function down(): void
    {
        Schema::table('book_audio_generation_overrides', function (Blueprint $table) {
            $table->dropUnique('book_audio_override_edition_unique');
            $table->dropIndex(['book_edition_id', 'book_block_version_id']);
            $table->dropConstrainedForeignId('book_edition_id');
            $table->unique('book_block_version_id');
        });
        foreach (['book_audio_jobs', 'book_audio_segments'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->dropIndex(['book_edition_id', 'book_block_version_id']);
                $table->dropConstrainedForeignId('book_edition_id');
            });
        }
        Schema::table('book_block_voice_assignments', function (Blueprint $table) {
            $table->dropUnique('book_block_voice_assignment_edition_unique');
            $table->dropConstrainedForeignId('book_edition_id');
            $table->unique(['book_block_id', 'book_block_version_id'], 'book_block_voice_assignment_version_unique');
        });
    }
};
