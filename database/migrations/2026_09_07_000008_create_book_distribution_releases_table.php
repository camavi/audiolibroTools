<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('book_distribution_releases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->foreignId('book_distribution_connection_id')->nullable()->constrained()->nullOnDelete();
            $table->string('provider_key', 80);
            $table->foreignId('book_publication_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('book_audio_publication_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status', 24)->default('queued');
            $table->json('package_json');
            $table->text('failure_message')->nullable();
            $table->string('external_reference')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['book_id', 'provider_key', 'status']);
        });
    }

    public function down(): void { Schema::dropIfExists('book_distribution_releases'); }
};
