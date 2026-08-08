<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_chat_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ai_chat_thread_id')->constrained('ai_chat_threads')->cascadeOnDelete();
            $table->string('role', 40);
            $table->longText('content');
            $table->string('source', 80)->nullable();
            $table->string('provider_key', 80)->nullable();
            $table->string('model', 120)->nullable();
            $table->json('metadata_json')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['ai_chat_thread_id', 'role', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_chat_messages');
    }
};
