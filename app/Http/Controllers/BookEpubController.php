<?php

namespace App\Http\Controllers;

use App\Models\Book;
use App\Services\BookEpubService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class BookEpubController extends Controller
{
    public function index(string $keyBook): JsonResponse
    {
        $book = $this->book($keyBook);

        return response()->json(['data' => [
            'settings' => $this->settings($book),
            'statistics' => $this->statistics($book),
            'generated_at' => $book->epub_generated_at?->toISOString(),
            'download_url' => $book->epub_file_path && Storage::disk('public')->exists($book->epub_file_path)
                ? route('dashboard.api.books.epub.download', ['keyBook' => $book->key_book], false) : null,
        ]]);
    }

    public function update(Request $request, string $keyBook): JsonResponse
    {
        $book = $this->book($keyBook);
        $settings = $this->validatedSettings($request, $book);
        $book->forceFill(['epub_settings_json' => $settings])->save();

        return response()->json(['data' => ['settings' => $settings]]);
    }

    public function generate(Request $request, string $keyBook, BookEpubService $epub): JsonResponse
    {
        $book = $this->book($keyBook);
        $settings = $this->validatedSettings($request, $book);
        $path = $epub->build($book, $settings);
        if ($book->epub_file_path && $book->epub_file_path !== $path) Storage::disk('public')->delete($book->epub_file_path);
        $book->forceFill(['epub_settings_json' => $settings, 'epub_file_path' => $path, 'epub_generated_at' => now()])->save();

        return response()->json(['data' => [
            'settings' => $settings,
            'generated_at' => $book->epub_generated_at?->toISOString(),
            'download_url' => route('dashboard.api.books.epub.download', ['keyBook' => $book->key_book], false),
        ]]);
    }

    public function download(string $keyBook)
    {
        $book = $this->book($keyBook);
        abort_unless($book->epub_file_path && Storage::disk('public')->exists($book->epub_file_path), 404);
        return response()->download(Storage::disk('public')->path($book->epub_file_path), pathinfo($book->epub_file_path, PATHINFO_BASENAME), ['Content-Type' => 'application/epub+zip']);
    }

    private function book(string $keyBook): Book
    {
        return Book::query()->where('account_id', auth()->id())->where('key_book', $keyBook)->firstOrFail();
    }

    private function settings(Book $book): array
    {
        $stored = $book->epub_settings_json ?? [];
        return [
            'metadata' => [
                'title' => $stored['metadata']['title'] ?? $book->name,
                'subtitle' => $stored['metadata']['subtitle'] ?? '',
                'author' => $stored['metadata']['author'] ?? '',
                'publisher' => $stored['metadata']['publisher'] ?? '',
                'publication_date' => $stored['metadata']['publication_date'] ?? now()->toDateString(),
                'identifier' => $stored['metadata']['identifier'] ?? '',
                'language' => $stored['metadata']['language'] ?? ($book->lang ?: 'en'),
                'description' => $stored['metadata']['description'] ?? ($book->description ?: ''),
                'subjects' => array_values($stored['metadata']['subjects'] ?? []),
                'rights' => $stored['metadata']['rights'] ?? '',
            ],
            'reading' => [
                'layout' => 'reflowable',
                'direction' => in_array($stored['reading']['direction'] ?? null, ['auto', 'ltr', 'rtl'], true) ? $stored['reading']['direction'] : 'auto',
                'include_toc' => (bool) ($stored['reading']['include_toc'] ?? true),
                'include_title_page' => (bool) ($stored['reading']['include_title_page'] ?? true),
                'chapter_break' => in_array($stored['reading']['chapter_break'] ?? null, ['heading', 'single'], true) ? $stored['reading']['chapter_break'] : 'heading',
            ],
        ];
    }

    private function validatedSettings(Request $request, Book $book): array
    {
        $validated = $request->validate([
            'settings' => ['required', 'array'],
            'settings.metadata' => ['required', 'array'],
            'settings.metadata.title' => ['required', 'string', 'max:255'],
            'settings.metadata.subtitle' => ['nullable', 'string', 'max:255'],
            'settings.metadata.author' => ['nullable', 'string', 'max:255'],
            'settings.metadata.publisher' => ['nullable', 'string', 'max:255'],
            'settings.metadata.publication_date' => ['nullable', 'date_format:Y-m-d'],
            'settings.metadata.identifier' => ['nullable', 'string', 'max:255'],
            'settings.metadata.language' => ['required', 'string', 'max:12'],
            'settings.metadata.description' => ['nullable', 'string', 'max:5000'],
            'settings.metadata.subjects' => ['nullable', 'array', 'max:12'],
            'settings.metadata.subjects.*' => ['string', 'max:100'],
            'settings.metadata.rights' => ['nullable', 'string', 'max:1000'],
            'settings.reading' => ['required', 'array'],
            'settings.reading.direction' => ['required', 'in:auto,ltr,rtl'],
            'settings.reading.include_toc' => ['required', 'boolean'],
            'settings.reading.include_title_page' => ['required', 'boolean'],
            'settings.reading.chapter_break' => ['required', 'in:heading,single'],
        ]);
        $settings = $this->settings($book);
        return [
            'metadata' => [...$settings['metadata'], ...$validated['settings']['metadata'], 'subjects' => array_values(array_filter($validated['settings']['metadata']['subjects'] ?? []))],
            'reading' => [...$settings['reading'], ...$validated['settings']['reading'], 'layout' => 'reflowable'],
        ];
    }

    private function statistics(Book $book): array
    {
        $text = $book->blocks()->where('status', '!=', 'deleted')->pluck('text_plain')->implode("\n");
        preg_match_all('/\S+/u', $text, $words);
        return ['blocks' => $book->blocks()->where('status', '!=', 'deleted')->count(), 'words' => count($words[0]), 'has_cover' => filled($book->cover_img)];
    }
}
