<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('book_block_reviews', function (Blueprint $table) {
            if (! Schema::hasColumn('book_block_reviews', 'applied_book_block_version_id')) {
                $table->foreignId('applied_book_block_version_id')
                    ->nullable()
                    ->after('notes_json')
                    ->constrained('book_block_versions')
                    ->nullOnDelete();
            }

            if (! Schema::hasColumn('book_block_reviews', 'resolved_at')) {
                $table->timestamp('resolved_at')->nullable()->after('applied_book_block_version_id');
            }

            if (! Schema::hasColumn('book_block_reviews', 'resolved_by')) {
                $table->foreignId('resolved_by')
                    ->nullable()
                    ->after('resolved_at')
                    ->constrained('users')
                    ->nullOnDelete();
            }
        });

        Schema::table('book_block_reviews', function (Blueprint $table) {
            $table->index(['applied_book_block_version_id', 'status'], 'book_block_reviews_applied_version_status_index');
        });
    }

    public function down(): void
    {
        Schema::table('book_block_reviews', function (Blueprint $table) {
            $table->dropIndex('book_block_reviews_applied_version_status_index');

            if (Schema::hasColumn('book_block_reviews', 'resolved_by')) {
                $table->dropConstrainedForeignId('resolved_by');
            }

            if (Schema::hasColumn('book_block_reviews', 'applied_book_block_version_id')) {
                $table->dropConstrainedForeignId('applied_book_block_version_id');
            }

            if (Schema::hasColumn('book_block_reviews', 'resolved_at')) {
                $table->dropColumn('resolved_at');
            }
        });
    }
};
