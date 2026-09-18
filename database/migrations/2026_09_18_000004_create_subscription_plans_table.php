<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subscription_plans', function (Blueprint $table) {
            $table->id();
            $table->string('plan_key', 50)->unique();
            $table->string('name', 80);
            $table->string('description', 300)->nullable();
            $table->unsignedInteger('monthly_price_cents');
            $table->string('currency', 3)->default('EUR');
            $table->unsignedBigInteger('monthly_credits');
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        $now = now();
        DB::table('subscription_plans')->insert([
            ['plan_key' => 'starter', 'name' => 'Starter', 'description' => 'For individual projects and occasional AI work.', 'monthly_price_cents' => 900, 'currency' => 'EUR', 'monthly_credits' => 5000, 'is_active' => true, 'sort_order' => 1, 'created_at' => $now, 'updated_at' => $now],
            ['plan_key' => 'creator', 'name' => 'Creator', 'description' => 'For regular writing, translation and audiobook production.', 'monthly_price_cents' => 1900, 'currency' => 'EUR', 'monthly_credits' => 15000, 'is_active' => true, 'sort_order' => 2, 'created_at' => $now, 'updated_at' => $now],
            ['plan_key' => 'studio', 'name' => 'Studio', 'description' => 'For teams and high-volume production workflows.', 'monthly_price_cents' => 4900, 'currency' => 'EUR', 'monthly_credits' => 50000, 'is_active' => true, 'sort_order' => 3, 'created_at' => $now, 'updated_at' => $now],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_plans');
    }
};
