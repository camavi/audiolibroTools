<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('account_subscriptions', function (Blueprint $table): void {
            $table->string('provider_customer_id', 255)->nullable()->after('provider_subscription_id');
        });
    }

    public function down(): void
    {
        Schema::table('account_subscriptions', function (Blueprint $table): void {
            $table->dropColumn('provider_customer_id');
        });
    }
};
