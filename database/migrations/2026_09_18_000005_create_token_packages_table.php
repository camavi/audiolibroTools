<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('token_packages', function (Blueprint $table) {
            $table->id();
            $table->string('package_key', 50)->unique();
            $table->string('name', 80);
            $table->string('description', 300)->nullable();
            $table->unsignedInteger('price_cents');
            $table->string('currency', 3)->default('EUR');
            $table->unsignedBigInteger('credits');
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        $now = now();
        DB::table('token_packages')->insert([
            ['package_key' => 'mini', 'name' => 'Mini', 'description' => 'A small top-up for trying an extra AI task.', 'price_cents' => 399, 'currency' => 'EUR', 'credits' => 1000, 'is_active' => true, 'sort_order' => 1, 'created_at' => $now, 'updated_at' => $now],
            ['package_key' => 'plus', 'name' => 'Plus', 'description' => 'Extra capacity for ongoing work.', 'price_cents' => 1499, 'currency' => 'EUR', 'credits' => 5000, 'is_active' => true, 'sort_order' => 2, 'created_at' => $now, 'updated_at' => $now],
            ['package_key' => 'pro', 'name' => 'Pro', 'description' => 'A larger top-up for production workloads.', 'price_cents' => 2499, 'currency' => 'EUR', 'credits' => 10000, 'is_active' => true, 'sort_order' => 3, 'created_at' => $now, 'updated_at' => $now],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('token_packages');
    }
};
