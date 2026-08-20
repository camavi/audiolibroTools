<?php

namespace App\Http\Controllers;

use App\Models\Book;
use App\Models\BookEdition;
use App\Models\BookBlockTranslation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class BookEditionController extends Controller
{
    public function index(string $keyBook): JsonResponse
    {
        $book = $this->book($keyBook);
        $this->ensureOriginal($book);
        return response()->json(['data' => ['editions' => $book->editions()->orderByDesc('is_original')->orderBy('locale')->get()->map(fn (BookEdition $edition) => $this->serialize($book, $edition))->values()]]);
    }

    public function store(Request $request, string $keyBook): JsonResponse
    {
        $book = $this->book($keyBook);
        $data = $request->validate(['locale' => ['required', 'string', 'max:20', Rule::notIn([strtolower($book->lang ?: 'en')])], 'name' => ['nullable', 'string', 'max:255']]);
        $locale = strtolower($data['locale']);
        $edition = $book->editions()->firstOrCreate(['locale' => $locale], ['name' => ($data['name'] ?? null) ?: $book->name.' · '.strtoupper($locale), 'status' => 'draft', 'is_original' => false]);
        return response()->json(['data' => ['edition' => $this->serialize($book, $edition)]], 201);
    }

    private function ensureOriginal(Book $book): BookEdition
    {
        return $book->editions()->firstOrCreate(['locale' => strtolower($book->lang ?: 'en')], ['name' => $book->name, 'status' => 'ready', 'is_original' => true]);
    }

    private function serialize(Book $book, BookEdition $edition): array
    {
        $total = $book->blocks()->where('status', '!=', 'deleted')->whereNotNull('current_version_id')->count();
        $approved = $edition->is_original ? $total : BookBlockTranslation::query()->where('book_id', $book->id)->where('target_locale', $edition->locale)->where('status', 'approved')->whereIn('source_book_block_version_id', $book->blocks()->where('status', '!=', 'deleted')->pluck('current_version_id'))->distinct('book_block_id')->count('book_block_id');
        return ['id' => $edition->id, 'locale' => $edition->locale, 'name' => $edition->name, 'status' => $edition->is_original ? 'ready' : ($approved === $total && $total ? 'ready' : 'draft'), 'is_original' => $edition->is_original, 'approved_blocks' => $approved, 'total_blocks' => $total];
    }

    private function book(string $keyBook): Book { return Book::query()->where('account_id', auth()->id())->where('key_book', $keyBook)->firstOrFail(); }
}
