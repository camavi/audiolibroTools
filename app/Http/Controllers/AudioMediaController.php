<?php

namespace App\Http\Controllers;

use App\Models\AudioMediaAsset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class AudioMediaController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $kind = $request->string('kind')->toString();
        abort_unless(in_array($kind, ['music', 'fx'], true), 422);
        $search = trim($request->string('search')->toString());
        $assets = AudioMediaAsset::query()
            ->where('account_id', auth()->id())
            ->where('kind', $kind)
            ->when($search !== '', fn ($query) => $query->where(fn ($nested) => $nested->where('name', 'like', "%{$search}%")->orWhere('original_name', 'like', "%{$search}%")->orWhere('description', 'like', "%{$search}%")->orWhereJsonContains('tags', $search)))
            ->latest('created_at')
            ->get();

        return response()->json(['data' => ['assets' => $assets->map(fn (AudioMediaAsset $asset) => $this->asset($asset))->values()]]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'kind' => ['required', 'in:music,fx'], 'name' => ['nullable', 'string', 'max:160'], 'description' => ['nullable', 'string', 'max:1000'],
            'tags' => ['nullable', 'string', 'max:500'], 'duration_ms' => ['nullable', 'integer', 'min:0'],
            'file' => ['required', 'file', 'mimetypes:audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg', 'max:51200'],
        ]);
        $file = $data['file'];
        $name = trim((string) ($data['name'] ?? '')) ?: pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME);
        $tags = collect(explode(',', (string) ($data['tags'] ?? '')))->map(fn ($tag) => trim($tag))->filter()->unique()->take(12)->values()->all();
        $asset = AudioMediaAsset::query()->create([
            'account_id' => auth()->id(), 'kind' => $data['kind'], 'name' => $name, 'description' => $data['description'] ?? null,
            'tags' => $tags, 'original_name' => $file->getClientOriginalName(), 'duration_ms' => $data['duration_ms'] ?? null,
            'audio_path' => $file->store("audio-media/".auth()->id()."/{$data['kind']}", 'public'),
        ]);

        return response()->json(['data' => ['asset' => $this->asset($asset)]], 201);
    }

    public function stream(AudioMediaAsset $asset)
    {
        abort_unless($asset->account_id === auth()->id(), 404);
        abort_unless(Storage::disk('public')->exists($asset->audio_path), 404);
        $path = Storage::disk('public')->path($asset->audio_path);
        return response()->file($path, ['Content-Type' => mime_content_type($path) ?: 'audio/wav', 'Accept-Ranges' => 'bytes']);
    }

    private function asset(AudioMediaAsset $asset): array
    {
        return [...$asset->only(['id', 'kind', 'name', 'description', 'tags', 'original_name', 'duration_ms']), 'audio_url' => route('dashboard.api.audio-media.stream', $asset)];
    }
}
