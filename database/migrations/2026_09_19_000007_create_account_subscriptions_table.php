<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('subscription_plan_id')->nullable()->constrained()->nullOnDelete();
            $table->string('provider', 30)->default('stripe');
            $table->string('provider_subscription_id', 255)->nullable()->unique();
            $table->string('status', 30)->default('active');
            $table->string('plan_name', 80);
            $table->unsignedInteger('monthly_price_cents');
            $table->string('currency', 3);
            $table->unsignedBigInteger('monthly_credits');
            $table->timestamp('current_period_starts_at');
            $table->timestamp('current_period_ends_at');
            $table->boolean('cancel_at_period_end')->default(false);
            $table->timestamp('cancelled_at')->nullable();
            $table->json('metadata_json')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'status']);
            $table->index(['provider', 'status']);
        });

        Schema::create('subscription_credit_grants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_subscription_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('credits');
            $table->timestamp('period_starts_at');
            $table->timestamp('granted_at');
            $table->json('metadata_json')->nullable();
            $table->timestamps();
            $table->unique(['account_subscription_id', 'period_starts_at']);
            $table->index(['user_id', 'granted_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_credit_grants');
        Schema::dropIfExists('account_subscriptions');
    }
};
