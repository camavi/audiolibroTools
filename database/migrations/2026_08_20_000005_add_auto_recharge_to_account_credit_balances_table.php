<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('account_credit_balances', function (Blueprint $table) {
            $table->boolean('auto_recharge_enabled')->default(false)->after('consumed_credits');
            $table->unsignedBigInteger('auto_recharge_threshold')->nullable()->after('auto_recharge_enabled');
            $table->unsignedBigInteger('auto_recharge_amount')->nullable()->after('auto_recharge_threshold');
        });
    }

    public function down(): void
    {
        Schema::table('account_credit_balances', function (Blueprint $table) {
            $table->dropColumn(['auto_recharge_enabled', 'auto_recharge_threshold', 'auto_recharge_amount']);
        });
    }
};
