<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Online releases were publicly accessible before delivery policies existed.
        DB::table('books')->where('public_access', 'private')->where(function (Builder $query): void {
            $query->whereExists(function (Builder $releases): void {
                $releases->selectRaw('1')->from('book_publications')->whereColumn('book_publications.book_id', 'books.id')->where('status', 'ready')->where('is_online', true);
            })->orWhereExists(function (Builder $releases): void {
                $releases->selectRaw('1')->from('book_audio_publications')->whereColumn('book_audio_publications.book_id', 'books.id')->where('status', 'ready')->where('is_online', true);
            });
        })->update(['public_access' => 'public']);
    }

    public function down(): void
    {
        // Do not infer a previous owner choice when rolling back.
    }
};
