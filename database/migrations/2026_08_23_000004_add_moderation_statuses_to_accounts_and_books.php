<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('account_status', 20)->default('active')->after('role')->index();
            $table->text('restriction_reason')->nullable()->after('account_status');
            $table->timestamp('restricted_at')->nullable()->after('restriction_reason');
            $table->foreignId('restricted_by')->nullable()->after('restricted_at')->constrained('users')->nullOnDelete();
        });
        Schema::table('books', function (Blueprint $table): void {
            $table->string('moderation_status', 20)->default('active')->after('cover_img')->index();
            $table->text('moderation_reason')->nullable()->after('moderation_status');
            $table->timestamp('moderated_at')->nullable()->after('moderation_reason');
            $table->foreignId('moderated_by')->nullable()->after('moderated_at')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('books', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('moderated_by');
            $table->dropColumn(['moderation_status', 'moderation_reason', 'moderated_at']);
        });
        Schema::table('users', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('restricted_by');
            $table->dropColumn(['account_status', 'restriction_reason', 'restricted_at']);
        });
    }
};
