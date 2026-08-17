<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('audio_library_voice_samples', function (Blueprint $table) {
            $table->text('reference_text')->nullable()->after('description');
        });

        // Coqui voice identifiers cannot be used by Qwen. They are recreated
        // from the original reference audio when the voice is selected again.
        DB::table('audio_library_voice_samples')->whereNotNull('provider_voice_id')->update(['provider_voice_id' => null]);
        DB::table('audio_library_voices')->where('provider', 'at-coqui')->update(['provider' => 'at-qwen', 'provider_voice_id' => null]);
        DB::table('book_voice_profiles')->where('voice_provider', 'coqui-local')->update(['voice_provider' => 'qwen-local', 'voice_id' => null]);
    }

    public function down(): void
    {
        Schema::table('audio_library_voice_samples', function (Blueprint $table) {
            $table->dropColumn('reference_text');
        });
    }
};
