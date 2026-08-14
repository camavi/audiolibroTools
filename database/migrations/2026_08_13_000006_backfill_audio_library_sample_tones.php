<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('audio_library_tones')->orderBy('id')->each(function (object $tone): void {
            DB::table('audio_library_voice_samples')
                ->whereNull('tone_id')
                ->where('tone', $tone->name)
                ->update(['tone_id' => $tone->id]);
        });
    }

    public function down(): void
    {
        // The sample's text tone remains stored, so this backfill is intentionally irreversible.
    }
};
