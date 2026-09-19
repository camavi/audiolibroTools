<?php

namespace App\Http\Controllers;

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
