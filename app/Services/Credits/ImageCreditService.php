<?php

namespace App\Services\Credits;

use App\Models\AccountCreditBalance;
use App\Models\AccountCreditLedgerEntry;
use App\Models\Book;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ImageCreditService
{
    public function reserve(Book $book, int $credits, string $reference): void
    {
        DB::transaction(function () use ($book, $credits, $reference): void {
            $balance = $this->balance($book->account_id, true);
            if ($balance->available_credits < $credits) {
                throw ValidationException::withMessages(['credits' => ['Insufficient Audiobook Tools credits to generate this cover.']]);
            }
            $balance->decrement('available_credits', $credits);
            $balance->increment('reserved_credits', $credits);
            $this->entry($book, 'reserved', $credits, $reference);
        });
    }

    public function consume(Book $book, int $credits, string $reference): void
    {
        DB::transaction(function () use ($book, $credits, $reference): void {
            $balance = $this->balance($book->account_id, true);
            $balance->decrement('reserved_credits', $credits);
            $balance->increment('consumed_credits', $credits);
            $this->entry($book, 'consumed', $credits, $reference);
        });
    }

    public function release(Book $book, int $credits, string $reference): void
    {
        DB::transaction(function () use ($book, $credits, $reference): void {
            $balance = $this->balance($book->account_id, true);
            $balance->decrement('reserved_credits', $credits);
            $balance->increment('available_credits', $credits);
            $this->entry($book, 'released', $credits, $reference);
        });
    }

    private function balance(?int $accountId, bool $locked): AccountCreditBalance
    {
        AccountCreditBalance::query()->firstOrCreate(['account_id' => $accountId], ['available_credits' => 0, 'reserved_credits' => 0, 'consumed_credits' => 0]);
        $query = AccountCreditBalance::query()->where('account_id', $accountId);
        if ($locked) {
            $query->lockForUpdate();
        }

        return $query->firstOrFail();
    }

    private function entry(Book $book, string $type, int $credits, string $reference): void
    {
        AccountCreditLedgerEntry::query()->create(['account_id' => $book->account_id, 'book_id' => $book->id, 'type' => "image_{$type}", 'credits' => $credits, 'metadata_json' => ['reason' => 'cover_generation', 'reference' => $reference]]);
    }
}
