<?php

namespace App\Http\Controllers;

use App\Models\AccountCreditBalance;
use App\Models\AccountCreditLedgerEntry;
use App\Models\User;
use App\Models\TokenPackage;
use App\Services\Credits\TranslationCreditService;
use App\Services\Payments\StripeCheckoutService;
use App\Models\TokenPurchase;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class TokenWalletController extends Controller
{
    public function show(Request $request, TranslationCreditService $credits): JsonResponse
    {
        $user = $this->user($request);
        $balance = $credits->balance($user->id);
        $since = now()->subDays(30);
        $entries = AccountCreditLedgerEntry::query()
            ->where('account_id', $user->id)
            ->with('book:id,name')
            ->latest()
            ->limit(12)
            ->get();

        return response()->json(['data' => [
            'balance' => $this->serializeBalance($balance),
            'usage' => [
                'consumed_last_30_days' => (int) AccountCreditLedgerEntry::query()->where('account_id', $user->id)->where('type', 'consumed')->where('created_at', '>=', $since)->sum('credits'),
                'reserved_now' => (int) $balance->reserved_credits,
                'entries_last_30_days' => AccountCreditLedgerEntry::query()->where('account_id', $user->id)->where('created_at', '>=', $since)->count(),
            ],
            'history' => $entries->map(fn (AccountCreditLedgerEntry $entry) => [
                'id' => $entry->id,
                'type' => $entry->type,
                'credits' => (int) $entry->credits,
                'book_name' => $entry->book?->name,
                'reason' => $entry->metadata_json['reason'] ?? null,
                'created_at' => $entry->created_at?->toISOString(),
            ])->values(),
            'top_up_packages' => TokenPackage::query()->where('is_active', true)->orderBy('sort_order')->get()->map(fn (TokenPackage $package) => [
                'id' => $package->id, 'name' => $package->name, 'description' => $package->description, 'credits' => (int) $package->credits, 'price_cents' => (int) $package->price_cents, 'currency' => $package->currency,
            ])->values(),
            'payments_ready' => app(StripeCheckoutService::class)->isConfigured(),
        ]]);
    }

    public function updateAutoRecharge(Request $request, TranslationCreditService $credits): JsonResponse
    {
        $user = $this->user($request);
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'threshold' => ['nullable', 'integer', 'min:1', 'max:1000000'],
            'amount' => ['nullable', 'integer', 'min:100', 'max:1000000'],
        ]);

        if ($data['enabled'] && (! isset($data['threshold'], $data['amount']) || $data['threshold'] >= $data['amount'])) {
            throw ValidationException::withMessages([
                'threshold' => ['The threshold must be lower than the top-up amount.'],
            ]);
        }

        $balance = $credits->balance($user->id);
        $balance->fill([
            'auto_recharge_enabled' => $data['enabled'],
            'auto_recharge_threshold' => $data['enabled'] ? $data['threshold'] : null,
            'auto_recharge_amount' => $data['enabled'] ? $data['amount'] : null,
        ])->save();

        return response()->json(['data' => ['balance' => $this->serializeBalance($balance->fresh())]]);
    }

    public function createCheckout(Request $request, StripeCheckoutService $stripe): JsonResponse
    {
        $user = $this->user($request);
        $data = $request->validate(['token_package_id' => ['required', 'integer']]);
        $package = TokenPackage::query()->whereKey($data['token_package_id'])->where('is_active', true)->firstOrFail();

        $purchase = TokenPurchase::query()->create([
            'user_id' => $user->id,
            'token_package_id' => $package->id,
            'provider' => 'stripe',
            'amount_cents' => $package->price_cents,
            'currency' => $package->currency,
            'credits' => $package->credits,
            'status' => 'pending',
            'metadata_json' => ['package_name' => $package->name, 'package_key' => $package->package_key],
        ]);

        try {
            $checkout = $stripe->createTopUpCheckout($purchase, $user->email);
            $purchase->update(['provider_checkout_session_id' => $checkout['id'], 'status' => 'checkout_created']);
        } catch (\Throwable $error) {
            $purchase->update(['status' => 'failed', 'metadata_json' => [...($purchase->metadata_json ?? []), 'checkout_error' => $error->getMessage()]]);
            throw $error;
        }

        return response()->json(['data' => ['checkout_url' => $checkout['url']]], 201);
    }

    private function user(Request $request): User
    {
        /** @var User|null $user */
        $user = $request->user();
        abort_unless($user, 401, 'Please sign in to manage tokens.');

        return $user;
    }

    private function serializeBalance(AccountCreditBalance $balance): array
    {
        return [
            'available_credits' => (int) $balance->available_credits,
            'reserved_credits' => (int) $balance->reserved_credits,
            'consumed_credits' => (int) $balance->consumed_credits,
            'auto_recharge_enabled' => (bool) $balance->auto_recharge_enabled,
            'auto_recharge_threshold' => $balance->auto_recharge_threshold === null ? null : (int) $balance->auto_recharge_threshold,
            'auto_recharge_amount' => $balance->auto_recharge_amount === null ? null : (int) $balance->auto_recharge_amount,
        ];
    }
}
