<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('book_correction_job_failures', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_correction_job_id')->constrained()->cascadeOnDelete();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->foreignId('book_block_id')->constrained()->cascadeOnDelete();
            $table->foreignId('book_block_version_id')->nullable()->constrained()->nullOnDelete();
            $table->string('block_uuid', 64);
            $table->text('error_message');
            $table->unsignedInteger('attempts')->default(1);
            $table->timestamp('last_attempt_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->unique(['book_correction_job_id', 'book_block_id', 'book_block_version_id'], 'correction_job_failure_block_version_unique');
            $table->index(['book_correction_job_id', 'resolved_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('book_correction_job_failures');
    }
};
