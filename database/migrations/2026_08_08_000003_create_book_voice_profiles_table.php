<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('book_voice_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->string('name', 160);
            $table->string('role', 40)->default('character');
            $table->string('voice_provider', 80)->nullable();
            $table->string('voice_id', 160)->nullable();
            $table->string('language', 20)->nullable();
            $table->text('notes')->nullable();
            $table->json('settings_json')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['book_id', 'role']);
            $table->index(['book_id', 'name']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('book_voice_profiles');
    }
};
