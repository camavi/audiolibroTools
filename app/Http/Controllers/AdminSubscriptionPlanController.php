<?php

namespace App\Http\Controllers;

use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Services\AdminAuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminSubscriptionPlanController extends Controller
{
    public function __construct(private readonly AdminAuditService $audit)
    {
    }

    public function index(): JsonResponse
    {
        return response()->json(['data' => ['plans' => SubscriptionPlan::query()->orderBy('sort_order')->get()->map(fn (SubscriptionPlan $plan) => $this->plan($plan))->values()]]);
    }

    public function update(Request $request, SubscriptionPlan $plan): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'description' => ['nullable', 'string', 'max:300'],
            'monthly_price_cents' => ['required', 'integer', 'min:0', 'max:100000000'],
            'currency' => ['required', 'string', 'size:3', 'alpha'],
            'monthly_credits' => ['required', 'integer', 'min:0', 'max:100000000'],
            'is_active' => ['required', 'boolean'],
        ]);

        $plan->update([
            ...$data,
            'name' => trim($data['name']),
            'description' => filled($data['description'] ?? null) ? trim($data['description']) : null,
            'currency' => strtoupper($data['currency']),
        ]);
        $this->audit->record($request, $actor, 'admin.subscription_plan_updated', ['plan_key' => $plan->plan_key, 'is_active' => $plan->is_active]);

        return response()->json(['data' => ['plan' => $this->plan($plan->fresh())]]);
    }

    private function plan(SubscriptionPlan $plan): array
    {
        return [
            'id' => $plan->id,
            'plan_key' => $plan->plan_key,
            'name' => $plan->name,
            'description' => $plan->description,
            'monthly_price_cents' => $plan->monthly_price_cents,
            'currency' => $plan->currency,
            'monthly_credits' => $plan->monthly_credits,
            'is_active' => $plan->is_active,
        ];
    }
}
