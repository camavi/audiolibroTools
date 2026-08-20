<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('books', function (Blueprint $table) {
            $table->json('epub_settings_json')->nullable()->after('book_design_json');
            $table->string('epub_file_path')->nullable()->after('epub_settings_json');
            $table->timestamp('epub_generated_at')->nullable()->after('epub_file_path');
        });
    }

    public function down(): void
    {
        Schema::table('books', function (Blueprint $table) {
            $table->dropColumn(['epub_settings_json', 'epub_file_path', 'epub_generated_at']);
        });
    }
};
