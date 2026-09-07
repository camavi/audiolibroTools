<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('books', function (Blueprint $table) {
            $table->string('manuscript_file_path')->nullable()->after('id_file');
            $table->string('manuscript_original_name')->nullable()->after('manuscript_file_path');
            $table->string('manuscript_mime_type', 120)->nullable()->after('manuscript_original_name');
            $table->unsignedBigInteger('manuscript_size')->nullable()->after('manuscript_mime_type');
            $table->timestamp('manuscript_imported_at')->nullable()->after('manuscript_size');
        });
    }

    public function down(): void
    {
        Schema::table('books', function (Blueprint $table) {
            $table->dropColumn([
                'manuscript_file_path',
                'manuscript_original_name',
                'manuscript_mime_type',
                'manuscript_size',
                'manuscript_imported_at',
            ]);
        });
    }
};
