<?php

namespace App\Http\Controllers;

use App\Models\AccountSubscription;
use App\Models\TokenPurchase;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminBillingController extends Controller
{
    public function tokenSales(Request $request): JsonResponse
    {
        $data = $request->validate([
            'period' => ['nullable', 'integer', 'in:30,90,365'],
            'group_by' => ['nullable', 'in:day,week,month'],
        ]);
        $days = $data['period'] ?? 90;
        $groupBy = $data['group_by'] ?? ($days <= 30 ? 'day' : ($days <= 90 ? 'week' : 'month'));
        $from = now()->subDays($days - 1)->startOfDay();
        $purchases = TokenPurchase::query()
            ->with('user:id,name,email')
            ->where('created_at', '>=', $from)
            ->latest('created_at')
            ->get();
        $paid = $purchases->filter(fn (TokenPurchase $purchase) => $purchase->status === 'paid' && $purchase->paid_at && $purchase->paid_at->greaterThanOrEqualTo($from));
        $revenue = (int) $paid->sum('amount_cents');

        return response()->json(['data' => [
            'period' => $days,
            'group_by' => $groupBy,
            'summary' => [
                'revenue_cents' => $revenue,
                'paid_purchases' => $paid->count(),
                'paying_customers' => $paid->pluck('user_id')->unique()->count(),
                'credits_sold' => (int) $paid->sum('credits'),
                'average_order_cents' => $paid->isNotEmpty() ? (int) round($revenue / $paid->count()) : 0,
            ],
            'trend' => $this->trend($paid, $from, $groupBy),
            'packages' => $paid->groupBy(fn (TokenPurchase $purchase) => $purchase->metadata_json['package_key'] ?? "package-{$purchase->token_package_id}")
                ->map(fn ($items, string $key) => [
                    'key' => $key,
                    'name' => $items->first()->metadata_json['package_name'] ?? 'Removed package',
                    'purchases' => $items->count(),
                    'revenue_cents' => (int) $items->sum('amount_cents'),
                    'credits_sold' => (int) $items->sum('credits'),
                ])->sortByDesc('revenue_cents')->values(),
            'statuses' => collect(['pending', 'checkout_created', 'paid', 'failed'])->map(fn (string $status) => ['status' => $status, 'count' => $purchases->where('status', $status)->count()])->values(),
            'recent_purchases' => $purchases->take(12)->map(fn (TokenPurchase $purchase) => [
                'id' => $purchase->id,
                'customer' => $purchase->user?->email ?? 'Deleted user',
                'package_name' => $purchase->metadata_json['package_name'] ?? 'Removed package',
                'amount_cents' => $purchase->amount_cents,
                'currency' => $purchase->currency,
                'credits' => $purchase->credits,
                'status' => $purchase->status,
                'paid_at' => $purchase->paid_at?->toISOString(),
                'created_at' => $purchase->created_at?->toISOString(),
            ])->values(),
        ]]);
    }

    public function subscriptions(Request $request): JsonResponse
    {
        $data = $request->validate(['period' => ['nullable', 'integer', 'in:30,90,365']]);
        $days = $data['period'] ?? 90;
        $from = now()->subDays($days - 1)->startOfDay();
        $subscriptions = AccountSubscription::query()
            ->with('user:id,name,email')
            ->where(function ($query) use ($from): void {
                $query->where('created_at', '>=', $from)
                    ->orWhere('cancelled_at', '>=', $from)
                    ->orWhereIn('status', ['active', 'canceling', 'past_due']);
            })
            ->latest('created_at')
            ->get();
        $billable = $subscriptions->whereIn('status', ['active', 'canceling']);
        $cancelled = $subscriptions->where('status', 'cancelled')->filter(fn (AccountSubscription $subscription) => $subscription->cancelled_at?->greaterThanOrEqualTo($from));
        $planDistribution = $billable->groupBy(fn (AccountSubscription $subscription) => $subscription->plan_name)
            ->map(fn ($items, string $planName) => [
                'plan_name' => $planName,
                'active_subscriptions' => $items->count(),
                'mrr_cents' => (int) $items->sum('monthly_price_cents'),
                'monthly_credits' => (int) $items->sum('monthly_credits'),
                'currency' => $items->first()->currency,
            ])->sortByDesc('mrr_cents')->values();

        return response()->json(['data' => [
            'period' => $days,
            'summary' => [
                'active_subscriptions' => $billable->count(),
                'mrr_cents' => (int) $billable->sum('monthly_price_cents'),
                'new_subscriptions' => $subscriptions->filter(fn (AccountSubscription $subscription) => $subscription->created_at->greaterThanOrEqualTo($from))->count(),
                'cancelled_subscriptions' => $cancelled->count(),
                'scheduled_cancellations' => $subscriptions->where('status', 'canceling')->count(),
                'past_due_subscriptions' => $subscriptions->where('status', 'past_due')->count(),
            ],
            'plans' => $planDistribution,
            'statuses' => collect(['active', 'canceling', 'past_due', 'cancelled', 'replaced'])->map(fn (string $status) => [
                'status' => $status,
                'count' => $subscriptions->where('status', $status)->count(),
            ])->values(),
            'recent_subscriptions' => $subscriptions->take(12)->map(fn (AccountSubscription $subscription) => [
                'id' => $subscription->id,
                'customer' => $subscription->user?->email ?? 'Deleted user',
                'plan_name' => $subscription->plan_name,
                'monthly_price_cents' => $subscription->monthly_price_cents,
                'currency' => $subscription->currency,
                'monthly_credits' => $subscription->monthly_credits,
                'status' => $subscription->status,
                'current_period_ends_at' => $subscription->current_period_ends_at?->toISOString(),
                'created_at' => $subscription->created_at?->toISOString(),
            ])->values(),
        ]]);
    }

    private function trend($purchases, Carbon $from, string $groupBy): array
    {
        $now = now();
        $cursor = match ($groupBy) {
            'day' => $from->copy()->startOfDay(),
            'week' => $from->copy()->startOfWeek(),
            default => $from->copy()->startOfMonth(),
        };
        $end = match ($groupBy) {
            'day' => $now->copy()->startOfDay(),
            'week' => $now->copy()->startOfWeek(),
            default => $now->copy()->startOfMonth(),
        };
        $buckets = [];
        while ($cursor->lessThanOrEqualTo($end)) {
            $key = $this->bucketKey($cursor, $groupBy);
            $buckets[$key] = ['key' => $key, 'label' => $this->bucketLabel($cursor, $groupBy), 'revenue_cents' => 0, 'purchases' => 0, 'credits_sold' => 0];
            $cursor = match ($groupBy) {
                'day' => $cursor->addDay(),
                'week' => $cursor->addWeek(),
                default => $cursor->addMonth(),
            };
        }
        foreach ($purchases as $purchase) {
            $key = $this->bucketKey($purchase->paid_at, $groupBy);
            if (! isset($buckets[$key])) continue;
            $buckets[$key]['revenue_cents'] += (int) $purchase->amount_cents;
            $buckets[$key]['purchases']++;
            $buckets[$key]['credits_sold'] += (int) $purchase->credits;
        }

        return array_values($buckets);
    }

    private function bucketKey(Carbon $date, string $groupBy): string
    {
        return match ($groupBy) {
            'day' => $date->toDateString(),
            'week' => $date->copy()->startOfWeek()->toDateString(),
            default => $date->format('Y-m'),
        };
    }

    private function bucketLabel(Carbon $date, string $groupBy): string
    {
        return match ($groupBy) {
            'day' => $date->format('d M'),
            'week' => 'W '.$date->isoWeek().' · '.$date->isoWeekYear(),
            default => $date->format('M Y'),
        };
    }
}
