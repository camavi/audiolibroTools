<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('books', function (Blueprint $table) {
            $table->json('pdf_settings_json')->nullable()->after('epub_generated_at');
            $table->string('pdf_file_path')->nullable()->after('pdf_settings_json');
            $table->timestamp('pdf_generated_at')->nullable()->after('pdf_file_path');
        });
    }

    public function down(): void
    {
        Schema::table('books', fn (Blueprint $table) => $table->dropColumn(['pdf_settings_json', 'pdf_file_path', 'pdf_generated_at']));
    }
};
