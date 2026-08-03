<?php

namespace App\Http\Controllers;

use App\Models\Book;
use App\Models\BookCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class DashboardBookController extends Controller
{
    public function categories(): JsonResponse
    {
        $categories = BookCategory::query()
            ->orderBy('name')
            ->get(['id', 'name']);

        return response()->json(['data' => $categories]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:180'],
            'description' => ['nullable', 'string', 'max:5000'],
            'categories' => ['nullable', 'array'],
            'categories.*' => ['integer', 'exists:book_categories,id'],
        ]);

        $accountId = auth()->id();
        $keyBook = md5(($accountId ?: 'guest').'-'.$validated['title'].'-'.microtime(true).'-'.Str::random(8));

        $book = Book::query()->create([
            'account_id' => $accountId,
            'key_book' => $keyBook,
            'id_file' => 0,
            'name' => $validated['title'],
            'description' => $validated['description'] ?? '',
            'categories' => $validated['categories'] ?? [],
        ]);

        Storage::disk('local')->put('bookEdit/'.($accountId ?: 'guest')."/{$keyBook}.json", '');

        return response()->json([
            'data' => [
                'id' => $book->id,
                'key_book' => $book->key_book,
                'name' => $book->name,
            ],
        ], 201);
    }
}
