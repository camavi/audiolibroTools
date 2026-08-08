<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_service_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('book_id')->nullable()->constrained('books')->cascadeOnDelete();
            $table->string('service', 60);
            $table->foreignId('ai_provider_id')->nullable()->constrained('ai_providers')->nullOnDelete();
            $table->string('provider_key', 80);
            $table->string('model', 120);
            $table->json('options_json')->nullable();
            $table->timestamps();

            $table->index(['account_id', 'book_id', 'service']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_service_settings');
    }
};
