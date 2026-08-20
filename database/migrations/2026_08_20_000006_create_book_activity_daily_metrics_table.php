<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration { public function up(): void { Schema::create('book_activity_daily_metrics', function (Blueprint $table) { $table->id(); $table->foreignId('book_id')->constrained()->cascadeOnDelete(); $table->string('provider_key',80)->default('direct'); $table->date('metric_date'); $table->unsignedBigInteger('plays')->default(0); $table->unsignedBigInteger('listeners')->default(0); $table->unsignedBigInteger('completions')->default(0); $table->unsignedBigInteger('shares')->default(0); $table->unsignedBigInteger('listening_seconds')->default(0); $table->integer('revenue_cents')->default(0); $table->timestamps(); $table->unique(['book_id','provider_key','metric_date']); $table->index(['book_id','metric_date']); }); } public function down(): void { Schema::dropIfExists('book_activity_daily_metrics'); } };
