<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_providers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('provider_key', 80);
            $table->string('name', 120);
            $table->string('base_url')->nullable();
            $table->json('models_json')->nullable();
            $table->string('default_model', 120)->nullable();
            $table->boolean('is_custom')->default(true);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['account_id', 'provider_key']);
            $table->index(['account_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_providers');
    }
};
