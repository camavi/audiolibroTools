<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_model_prices', function (Blueprint $table) {
            $table->id();
            $table->string('provider_key', 80);
            $table->string('model', 160);
            $table->string('modality', 20);
            $table->string('pricing_unit', 40);
            $table->decimal('input_price_usd', 12, 6)->nullable();
            $table->decimal('output_price_usd', 12, 6)->nullable();
            $table->decimal('unit_price_usd', 12, 6)->nullable();
            $table->timestamps();

            $table->unique(['provider_key', 'model', 'modality']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_model_prices');
    }
};
