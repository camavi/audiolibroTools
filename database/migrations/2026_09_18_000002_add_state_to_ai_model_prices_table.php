<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ai_model_prices', function (Blueprint $table) {
            $table->boolean('is_enabled')->default(true)->after('pricing_unit');
            $table->boolean('is_hidden')->default(false)->after('is_enabled');
        });
    }

    public function down(): void
    {
        Schema::table('ai_model_prices', function (Blueprint $table) {
            $table->dropColumn(['is_enabled', 'is_hidden']);
        });
    }
};
