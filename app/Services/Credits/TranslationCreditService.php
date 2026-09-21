<?php

namespace App\Services\Credits;

use App\Models\AccountCreditBalance;
use App\Models\AccountCreditLedgerEntry;
use App\Models\AiModelPrice;
use App\Models\BookTranslationJob;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TranslationCreditService
{
    public function pricing(string $providerKey, string $model): array
    {
        $price = AiModelPrice::query()
            ->where(['provider_key' => $providerKey, 'model' => $model, 'modality' => 'text'])
            ->where('is_enabled', true)
            ->where('is_hidden', false)
            ->first();

        if (! $price || ! $price->input_tokens || ! $price->output_tokens) {
            throw ValidationException::withMessages([
                'model' => ['Configure customer token charges for both input and output before starting this translation.'],
            ]);
        }

        return [
            'provider_key' => $providerKey,
            'model' => $model,
            'input_tokens_per_1000' => (int) $price->input_tokens,
            'output_tokens_per_1000' => (int) $price->output_tokens,
        ];
    }

    public function estimateUsage(string $text): array
    {
        $characters = mb_strlen($text);

        return [
            'input_tokens' => max(1, (int) ceil($characters / 3) + 500),
            'output_tokens' => max(1, (int) ceil($characters / 3) + 500),
        ];
    }

    public function quote(array $pricing, int $inputTokens, int $outputTokens): int
    {
        return (int) ceil(max(0, $inputTokens) / 1000 * (int) ($pricing['input_tokens_per_1000'] ?? 0))
            + (int) ceil(max(0, $outputTokens) / 1000 * (int) ($pricing['output_tokens_per_1000'] ?? 0));
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

    public function consume(BookTranslationJob $job, int $credits, array $metadata = []): void
    {
        if ($credits < 1) {
            return;
        }

        DB::transaction(function () use ($job, $credits, $metadata) {
            $balance = $this->lockedBalance($job->created_by ?: $job->book->account_id);
            $amount = min($credits, max(0, $job->reserved_credits - $job->consumed_credits - $job->released_credits));
            if ($amount < 1) {
                return;
            }

            $balance->decrement('reserved_credits', $amount);
            $balance->increment('consumed_credits', $amount);
            $job->increment('consumed_credits', $amount);
            $this->entry($job, 'consumed', $amount, ['reason' => 'translation_block_completed', ...$metadata]);
        });
    }

    public function release(BookTranslationJob $job, int $credits, string $reason): void
    {
        if ($credits < 1) {
            return;
        }

        DB::transaction(function () use ($job, $credits, $reason) {
            $balance = $this->lockedBalance($job->created_by ?: $job->book->account_id);
            $amount = min($credits, max(0, $job->reserved_credits - $job->consumed_credits - $job->released_credits));
            if ($amount < 1) {
                return;
            }

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
