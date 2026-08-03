<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('books', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedBigInteger('id_file')->default(0);
            $table->string('key_book')->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->json('categories')->nullable();
            $table->string('lang', 12)->nullable();
            $table->string('cover_img')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('books');
    }
};
