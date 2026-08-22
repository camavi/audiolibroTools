<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $tone = [
            'description' => 'Speak with a low, rich and resonant voice, suited to calm or authoritative narration.',
            'color' => '#312E81',
            'enabled' => true,
            'updated_at' => now(),
        ];

        if (DB::table('audio_library_tones')->where('name', 'deep')->exists()) {
            DB::table('audio_library_tones')->where('name', 'deep')->update($tone);
            return;
        }

        DB::table('audio_library_tones')->insert([
            ...$tone,
            'id' => 69,
            'name' => 'deep',
            'created_at' => now(),
        ]);
    }

    public function down(): void
    {
        DB::table('audio_library_tones')->where('name', 'deep')->delete();
    }
};
