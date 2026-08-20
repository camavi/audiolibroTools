<?php
use Illuminate\Database\Migrations\Migration;use Illuminate\Database\Schema\Blueprint;use Illuminate\Support\Facades\Schema;
return new class extends Migration{public function up():void{Schema::create('ai_prompts',function(Blueprint $t){$t->id();$t->foreignId('account_id')->constrained('users')->cascadeOnDelete();$t->string('title',160);$t->string('category',80);$t->text('description')->nullable();$t->longText('prompt');$t->timestamps();$t->index(['account_id','category']);});}public function down():void{Schema::dropIfExists('ai_prompts');}};
