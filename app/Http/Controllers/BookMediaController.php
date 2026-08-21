<?php

namespace App\Http\Controllers;

use App\Models\Book;
use App\Models\BookMediaAsset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class BookMediaController extends Controller
{
    public function index(string $keyBook): JsonResponse
    {
        $book = $this->book($keyBook);

        return response()->json(['data' => [
            'assets' => $book->mediaAssets()
                ->latest('id')
                ->get()
                ->map(fn (BookMediaAsset $asset) => $this->serialize($asset))
                ->values(),
        ]]);
    }

    public function store(Request $request, string $keyBook): JsonResponse
    {
        $data = $request->validate([
            'image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp,gif', 'max:12288'],
            'name' => ['nullable', 'string', 'max:180'],
        ]);
        $book = $this->book($keyBook);
        $image = $data['image'];
        $path = $image->store("book-media/{$book->key_book}", 'public');
        $dimensions = @getimagesize(Storage::disk('public')->path($path)) ?: [null, null];
        $asset = BookMediaAsset::query()->create([
            'book_id' => $book->id,
            'account_id' => $book->account_id,
            'name' => trim($data['name'] ?: pathinfo($image->getClientOriginalName(), PATHINFO_FILENAME)) ?: 'Image',
            'image_path' => $path,
            'mime_type' => $image->getMimeType() ?: 'image/*',
            'width' => $dimensions[0],
            'height' => $dimensions[1],
            'metadata_json' => ['original_name' => $image->getClientOriginalName(), 'bytes' => $image->getSize()],
            'created_by' => auth()->id(),
        ]);

        return response()->json(['data' => ['asset' => $this->serialize($asset)]], 201);
    }

    public function destroy(string $keyBook, BookMediaAsset $asset): JsonResponse
    {
        $book = $this->book($keyBook);
        abort_unless($asset->book_id === $book->id, 404);

        Storage::disk('public')->delete($asset->image_path);
        $asset->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }

    private function serialize(BookMediaAsset $asset): array
    {
        return [
            'id' => $asset->id,
            'name' => $asset->name,
            'image_url' => Storage::disk('public')->url($asset->image_path),
            'mime_type' => $asset->mime_type,
            'width' => $asset->width,
            'height' => $asset->height,
            'created_at' => $asset->created_at?->toISOString(),
        ];
    }

    private function book(string $keyBook): Book
    {
        return Book::query()
            ->where('account_id', auth()->id())
            ->where('key_book', $keyBook)
            ->firstOrFail();
    }
}
