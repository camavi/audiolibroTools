<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ai_model_prices', function (Blueprint $table): void {
            $table->unsignedInteger('customer_credits')->nullable()->after('unit_price_usd');
        });

        $price = DB::table('ai_model_prices')->where(['provider_key' => 'at-openai', 'model' => config('ai_providers.image_model', 'gpt-image-1'), 'modality' => 'image'])->first();
        if ($price) {
            DB::table('ai_model_prices')->where('id', $price->id)->update(['customer_credits' => 70]);
        } else {
            DB::table('ai_model_prices')->insert(['provider_key' => 'at-openai', 'provider_name' => 'AT · OpenAI', 'model' => config('ai_providers.image_model', 'gpt-image-1'), 'modality' => 'image', 'pricing_unit' => 'per_image', 'unit_price_usd' => 0.063, 'customer_credits' => 70, 'is_enabled' => true, 'is_hidden' => false, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        Schema::table('ai_model_prices', function (Blueprint $table): void {
            $table->dropColumn('customer_credits');
        });
    }
};
