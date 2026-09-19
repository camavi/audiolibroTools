<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('token_purchases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('token_package_id')->nullable()->constrained()->nullOnDelete();
            $table->string('provider', 30)->default('stripe');
            $table->string('provider_checkout_session_id', 255)->nullable()->unique();
            $table->string('provider_payment_intent_id', 255)->nullable()->unique();
            $table->unsignedInteger('amount_cents');
            $table->string('currency', 3);
            $table->unsignedBigInteger('credits');
            $table->string('status', 30)->default('pending');
            $table->json('metadata_json')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('credited_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'created_at']);
            $table->index(['provider', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('token_purchases');
    }
};
