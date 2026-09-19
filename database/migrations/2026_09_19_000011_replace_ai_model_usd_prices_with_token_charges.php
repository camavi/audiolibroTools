<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ai_model_prices', function (Blueprint $table): void {
            $table->unsignedInteger('input_tokens')->nullable()->after('pricing_unit');
            $table->unsignedInteger('output_tokens')->nullable()->after('input_tokens');
            $table->dropColumn(['input_price_usd', 'output_price_usd', 'unit_price_usd']);
        });
    }

    public function down(): void
    {
        Schema::table('ai_model_prices', function (Blueprint $table): void {
            $table->decimal('input_price_usd', 12, 6)->nullable();
            $table->decimal('output_price_usd', 12, 6)->nullable();
            $table->decimal('unit_price_usd', 12, 6)->nullable();
            $table->dropColumn(['input_tokens', 'output_tokens']);
        });
    }
};
