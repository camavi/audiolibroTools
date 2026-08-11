<?php

namespace App\Services\Credits;

use App\Models\AccountCreditBalance;
use App\Models\AccountCreditLedgerEntry;
use App\Models\Book;
use App\Models\BookTranslationJob;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TranslationCreditService
{
    public function quote(string $model, int $words): int
    {
        $provider = collect(config('ai_providers.defaults', []))->firstWhere('provider_key', 'at-openai');
        $rate = (int) ($provider['translation_credits_per_1000_words'][$model] ?? 0);

        if ($rate < 1 || $words < 1) {
            return 0;
        }

        return (int) ceil(($words / 1000) * $rate);
    }

    public function balance(?int $accountId): AccountCreditBalance
    {
        return AccountCreditBalance::query()->firstOrCreate(
            ['account_id' => $accountId],
            ['available_credits' => 0, 'reserved_credits' => 0, 'consumed_credits' => 0],
        );
    }

    public function reserve(BookTranslationJob $job, int $credits): void
    {
        DB::transaction(function () use ($job, $credits) {
            $balance = $this->lockedBalance($job->created_by ?: $job->book->account_id);

            if ($balance->available_credits < $credits) {
                throw ValidationException::withMessages([
                    'credits' => ['Insufficient Audiobook Tools credits for this translation batch.'],
                ]);
            }

            $balance->decrement('available_credits', $credits);
            $balance->increment('reserved_credits', $credits);
            $job->forceFill(['reserved_credits' => $credits])->save();
            $this->entry($job, 'reserved', $credits, ['reason' => 'translation_batch_start']);
        });
    }

    public function consume(BookTranslationJob $job, int $credits): void
    {
        if ($credits < 1) return;

        DB::transaction(function () use ($job, $credits) {
            $balance = $this->lockedBalance($job->created_by ?: $job->book->account_id);
            $amount = min($credits, max(0, $job->reserved_credits - $job->consumed_credits - $job->released_credits));
            if ($amount < 1) return;

            $balance->decrement('reserved_credits', $amount);
            $balance->increment('consumed_credits', $amount);
            $job->increment('consumed_credits', $amount);
            $this->entry($job, 'consumed', $amount, ['reason' => 'translation_block_completed']);
        });
    }

    public function release(BookTranslationJob $job, int $credits, string $reason): void
    {
        if ($credits < 1) return;

        DB::transaction(function () use ($job, $credits, $reason) {
            $balance = $this->lockedBalance($job->created_by ?: $job->book->account_id);
            $amount = min($credits, max(0, $job->reserved_credits - $job->consumed_credits - $job->released_credits));
            if ($amount < 1) return;

            $balance->increment('available_credits', $amount);
            $balance->decrement('reserved_credits', $amount);
            $job->increment('released_credits', $amount);
            $this->entry($job, 'released', $amount, ['reason' => $reason]);
        });
    }

    private function lockedBalance(?int $accountId): AccountCreditBalance
    {
        $this->balance($accountId);

        return AccountCreditBalance::query()
            ->where('account_id', $accountId)
            ->lockForUpdate()
            ->firstOrFail();
    }

    private function entry(BookTranslationJob $job, string $type, int $credits, array $metadata): void
    {
        AccountCreditLedgerEntry::query()->create([
            'account_id' => $job->created_by ?: $job->book->account_id,
            'book_id' => $job->book_id,
            'book_translation_job_id' => $job->id,
            'type' => $type,
            'credits' => $credits,
            'metadata_json' => $metadata,
        ]);
    }
}
