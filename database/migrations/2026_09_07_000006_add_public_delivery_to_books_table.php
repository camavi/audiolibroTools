<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('books', function (Blueprint $table) {
            $table->string('public_access', 16)->default('public')->after('cover_img');
            $table->string('public_share_token', 80)->nullable()->unique()->after('public_access');
        });
    }

    public function down(): void
    {
        Schema::table('books', function (Blueprint $table) {
            $table->dropUnique(['public_share_token']);
            $table->dropColumn(['public_access', 'public_share_token']);
        });
    }
};
