<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('book_translation_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->string('target_locale', 20);
            $table->string('status', 30)->default('queued');
            $table->string('provider_key', 80);
            $table->string('model', 120);
            $table->unsignedInteger('total_blocks')->default(0);
            $table->unsignedInteger('completed_blocks')->default(0);
            $table->unsignedInteger('skipped_blocks')->default(0);
            $table->unsignedInteger('failed_blocks')->default(0);
            $table->string('current_block_uuid', 64)->nullable();
            $table->json('request_json')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['book_id', 'target_locale', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('book_translation_jobs');
    }
};
