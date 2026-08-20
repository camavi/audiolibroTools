<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('book_distribution_connections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->foreignId('account_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('provider_key', 80);
            $table->string('account_label')->nullable();
            $table->text('api_token')->nullable();
            $table->string('status', 30)->default('not_connected');
            $table->timestamp('connected_at')->nullable();
            $table->timestamp('last_published_at')->nullable();
            $table->json('metadata_json')->nullable();
            $table->timestamps();
            $table->unique(['book_id', 'provider_key']);
        });
    }

    public function down(): void { Schema::dropIfExists('book_distribution_connections'); }
};
