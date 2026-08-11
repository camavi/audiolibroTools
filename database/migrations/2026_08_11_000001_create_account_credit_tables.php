<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_credit_balances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedBigInteger('available_credits')->default(0);
            $table->unsignedBigInteger('reserved_credits')->default(0);
            $table->unsignedBigInteger('consumed_credits')->default(0);
            $table->timestamps();
            $table->index('account_id');
        });

        Schema::create('account_credit_ledger_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('book_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('book_translation_job_id')->nullable()->constrained('book_translation_jobs')->nullOnDelete();
            $table->string('type', 30);
            $table->unsignedBigInteger('credits');
            $table->json('metadata_json')->nullable();
            $table->timestamps();
            $table->index(['account_id', 'created_at']);
            $table->index(['book_translation_job_id', 'type']);
        });

        Schema::table('book_translation_jobs', function (Blueprint $table) {
            $table->unsignedBigInteger('reserved_credits')->default(0)->after('failed_blocks');
            $table->unsignedBigInteger('consumed_credits')->default(0)->after('reserved_credits');
            $table->unsignedBigInteger('released_credits')->default(0)->after('consumed_credits');
        });
    }

    public function down(): void
    {
        Schema::table('book_translation_jobs', function (Blueprint $table) {
            $table->dropColumn(['reserved_credits', 'consumed_credits', 'released_credits']);
        });
        Schema::dropIfExists('account_credit_ledger_entries');
        Schema::dropIfExists('account_credit_balances');
    }
};
