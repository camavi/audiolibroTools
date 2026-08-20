<?php

namespace App\Http\Controllers;

use App\Models\Book;
use App\Models\BookDesignAsset;
use App\Services\BookCoverImageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class BookDesignController extends Controller
{
    public function index(string $keyBook): JsonResponse
    {
        $book = $this->book($keyBook);

        return response()->json(['data' => [
            'cover_img' => $book->cover_img,
            'assets' => $book->designAssets()->latest('id')->get()->map(fn (BookDesignAsset $asset) => $this->serialize($asset))->values(),
        ]]);
    }

    public function store(Request $request, string $keyBook): JsonResponse
    {
        $data = $request->validate([
            'image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:12288'],
            'name' => ['nullable', 'string', 'max:180'],
        ]);
        $book = $this->book($keyBook);
        $image = $data['image'];
        $path = $image->store("book-designs/{$book->key_book}", 'public');
        $dimensions = @getimagesize(Storage::disk('public')->path($path)) ?: [null, null];
        $asset = BookDesignAsset::query()->create([
            'book_id' => $book->id,
            'account_id' => $book->account_id,
            'name' => trim($data['name'] ?: pathinfo($image->getClientOriginalName(), PATHINFO_FILENAME)) ?: 'Cover image',
            'image_path' => $path,
            'mime_type' => $image->getMimeType() ?: 'image/*',
            'width' => $dimensions[0],
            'height' => $dimensions[1],
            'metadata_json' => ['original_name' => $image->getClientOriginalName(), 'bytes' => $image->getSize()],
            'created_by' => auth()->id(),
        ]);

        return response()->json(['data' => ['asset' => $this->serialize($asset)]], 201);
    }

    public function generate(Request $request, string $keyBook, BookCoverImageService $imageGenerator): JsonResponse
    {
        $data = $request->validate([
            'prompt' => ['required', 'string', 'min:3', 'max:2000'],
        ]);
        $book = $this->book($keyBook);
        $asset = $imageGenerator->generate($book, trim($data['prompt']));

        return response()->json(['data' => ['asset' => $this->serialize($asset)]], 201);
    }

    public function useAsCover(string $keyBook, BookDesignAsset $asset): JsonResponse
    {
        $book = $this->book($keyBook);
        abort_unless($asset->book_id === $book->id, 404);
        $book->forceFill(['cover_img' => Storage::disk('public')->url($asset->image_path)])->save();

        return response()->json(['data' => ['cover_img' => $book->cover_img, 'asset' => $this->serialize($asset)]]);
    }

    public function updateCoverSpec(Request $request, string $keyBook): JsonResponse
    {
        $data = $request->validate([
            'format' => ['required', 'in:a5,a6,custom'],
            'width_mm' => ['required', 'numeric', 'min:50', 'max:500'],
            'height_mm' => ['required', 'numeric', 'min:50', 'max:700'],
        ]);
        $book = $this->book($keyBook);
        $design = $book->book_design_json ?? [];
        $design['cover'] = [
            'format' => $data['format'],
            'width_mm' => (float) $data['width_mm'],
            'height_mm' => (float) $data['height_mm'],
        ];
        $book->forceFill(['book_design_json' => $design])->save();

        return response()->json(['data' => ['cover' => $design['cover']]]);
    }

    public function destroy(string $keyBook, BookDesignAsset $asset): JsonResponse
    {
        $book = $this->book($keyBook);
        abort_unless($asset->book_id === $book->id, 404);
        abort_if($book->cover_img === Storage::disk('public')->url($asset->image_path), 422, 'Choose another cover before deleting this image.');
        Storage::disk('public')->delete($asset->image_path);
        $asset->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }

    private function serialize(BookDesignAsset $asset): array
    {
        return [
            'id' => $asset->id, 'name' => $asset->name,
            'image_url' => Storage::disk('public')->url($asset->image_path),
            'mime_type' => $asset->mime_type, 'width' => $asset->width, 'height' => $asset->height,
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
