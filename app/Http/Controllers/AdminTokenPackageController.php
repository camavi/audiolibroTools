<?php

namespace App\Http\Controllers;

use App\Models\TokenPackage;
use App\Models\User;
use App\Services\AdminAuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class AdminTokenPackageController extends Controller
{
    public function __construct(private readonly AdminAuditService $audit) {}

    public function index(): JsonResponse
    {
        return response()->json(['data' => ['packages' => TokenPackage::query()->orderBy('sort_order')->get()->map(fn (TokenPackage $package) => $this->package($package))->values()]]);
    }

    public function store(Request $request): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $data = $this->validated($request);
        $key = Str::slug($data['name'], '-');
        abort_if($key === '', 422, 'The package name must contain letters or numbers.');
        abort_if(TokenPackage::query()->where('package_key', $key)->exists(), 422, 'A package with this name already exists.');
        $package = TokenPackage::query()->create([...$data, 'package_key' => $key, 'name' => trim($data['name']), 'description' => filled($data['description'] ?? null) ? trim($data['description']) : null, 'currency' => strtoupper($data['currency']), 'sort_order' => ((int) TokenPackage::query()->max('sort_order')) + 1]);
        $this->audit->record($request, $actor, 'admin.token_package_created', ['package_key' => $package->package_key]);

        return response()->json(['data' => ['package' => $this->package($package)]], 201);
    }

    public function update(Request $request, TokenPackage $package): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $data = $this->validated($request);
        $package->update([...$data, 'name' => trim($data['name']), 'description' => filled($data['description'] ?? null) ? trim($data['description']) : null, 'currency' => strtoupper($data['currency'])]);
        $this->audit->record($request, $actor, 'admin.token_package_updated', ['package_key' => $package->package_key, 'is_active' => $package->is_active]);

        return response()->json(['data' => ['package' => $this->package($package->fresh())]]);
    }

    public function destroy(Request $request, TokenPackage $package): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $key = $package->package_key;
        $package->delete();
        $this->audit->record($request, $actor, 'admin.token_package_deleted', ['package_key' => $key]);

        return response()->json([], 204);
    }

    private function validated(Request $request): array
    {
        return $request->validate(['name' => ['required', 'string', 'max:80'], 'description' => ['nullable', 'string', 'max:300'], 'price_cents' => ['required', 'integer', 'min:0', 'max:100000000'], 'currency' => ['required', 'string', 'size:3', 'alpha'], 'credits' => ['required', 'integer', 'min:1', 'max:100000000'], 'is_active' => ['required', 'boolean']]);
    }

    private function package(TokenPackage $package): array
    {
        return ['id' => $package->id, 'package_key' => $package->package_key, 'name' => $package->name, 'description' => $package->description, 'price_cents' => $package->price_cents, 'currency' => $package->currency, 'credits' => $package->credits, 'is_active' => $package->is_active];
    }
}
