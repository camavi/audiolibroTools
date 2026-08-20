<?php

namespace App\Http\Controllers;

use App\Models\Book;
use App\Services\BookPdfService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class BookPdfController extends Controller
{
    public function index(string $keyBook): JsonResponse
    {
        $book = $this->book($keyBook);
        return response()->json(['data' => ['settings' => $this->settings($book), 'statistics' => $this->statistics($book), 'generated_at' => $book->pdf_generated_at?->toISOString(), 'download_url' => $book->pdf_file_path && Storage::disk('public')->exists($book->pdf_file_path) ? route('dashboard.api.books.pdf.download', ['keyBook' => $keyBook], false) : null]]);
    }

    public function update(Request $request, string $keyBook): JsonResponse
    {
        $book = $this->book($keyBook); $settings = $this->validated($request, $book);
        $book->forceFill(['pdf_settings_json' => $settings])->save();
        return response()->json(['data' => ['settings' => $settings]]);
    }

    public function preview(Request $request, string $keyBook, BookPdfService $pdf)
    {
        $book = $this->book($keyBook); $settings = $request->has('settings') ? $this->validated($request, $book) : $this->settings($book);
        return response($pdf->render($book, $settings), 200, ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="preview.pdf"']);
    }

    public function generate(Request $request, string $keyBook, BookPdfService $pdf): JsonResponse
    {
        $book = $this->book($keyBook); $settings = $this->validated($request, $book); $path = $pdf->store($book, $settings);
        if ($book->pdf_file_path && $book->pdf_file_path !== $path) Storage::disk('public')->delete($book->pdf_file_path);
        $book->forceFill(['pdf_settings_json' => $settings, 'pdf_file_path' => $path, 'pdf_generated_at' => now()])->save();
        return response()->json(['data' => ['settings' => $settings, 'generated_at' => $book->pdf_generated_at?->toISOString(), 'download_url' => route('dashboard.api.books.pdf.download', ['keyBook' => $keyBook], false)]]);
    }

    public function download(string $keyBook)
    {
        $book = $this->book($keyBook); abort_unless($book->pdf_file_path && Storage::disk('public')->exists($book->pdf_file_path), 404);
        return response()->download(Storage::disk('public')->path($book->pdf_file_path), pathinfo($book->pdf_file_path, PATHINFO_BASENAME), ['Content-Type' => 'application/pdf']);
    }

    private function book(string $keyBook): Book { return Book::query()->where('account_id', auth()->id())->where('key_book', $keyBook)->firstOrFail(); }

    private function settings(Book $book): array
    {
        $stored = $book->pdf_settings_json ?? [];
        return ['metadata' => ['title' => $stored['metadata']['title'] ?? $book->name, 'subtitle' => $stored['metadata']['subtitle'] ?? '', 'author' => $stored['metadata']['author'] ?? '', 'publisher' => $stored['metadata']['publisher'] ?? '', 'rights' => $stored['metadata']['rights'] ?? ''], 'format' => ['size' => in_array($stored['format']['size'] ?? null, ['a4','a5','a6','letter','six_by_nine','custom'], true) ? $stored['format']['size'] : 'a5', 'width_mm' => $stored['format']['width_mm'] ?? 148, 'height_mm' => $stored['format']['height_mm'] ?? 210], 'layout' => ['margin_top' => $stored['layout']['margin_top'] ?? 20, 'margin_bottom' => $stored['layout']['margin_bottom'] ?? 20, 'margin_inside' => $stored['layout']['margin_inside'] ?? 18, 'margin_outside' => $stored['layout']['margin_outside'] ?? 15, 'alignment' => in_array($stored['layout']['alignment'] ?? null, ['left','justify'], true) ? $stored['layout']['alignment'] : 'justify', 'page_numbers' => (bool)($stored['layout']['page_numbers'] ?? true), 'title_page' => (bool)($stored['layout']['title_page'] ?? true), 'copyright_page' => (bool)($stored['layout']['copyright_page'] ?? true), 'chapter_new_page' => (bool)($stored['layout']['chapter_new_page'] ?? true), 'include_cover' => (bool)($stored['layout']['include_cover'] ?? true)]];
    }

    private function validated(Request $request, Book $book): array
    {
        $v = $request->validate(['settings' => ['required','array'], 'settings.metadata' => ['required','array'], 'settings.metadata.title' => ['required','string','max:255'], 'settings.metadata.subtitle' => ['nullable','string','max:255'], 'settings.metadata.author' => ['nullable','string','max:255'], 'settings.metadata.publisher' => ['nullable','string','max:255'], 'settings.metadata.rights' => ['nullable','string','max:1000'], 'settings.format' => ['required','array'], 'settings.format.size' => ['required','in:a4,a5,a6,letter,six_by_nine,custom'], 'settings.format.width_mm' => ['required','numeric','min:50','max:500'], 'settings.format.height_mm' => ['required','numeric','min:50','max:700'], 'settings.layout' => ['required','array'], 'settings.layout.margin_top' => ['required','numeric','min:5','max:80'], 'settings.layout.margin_bottom' => ['required','numeric','min:5','max:80'], 'settings.layout.margin_inside' => ['required','numeric','min:5','max:80'], 'settings.layout.margin_outside' => ['required','numeric','min:5','max:80'], 'settings.layout.alignment' => ['required','in:left,justify'], 'settings.layout.page_numbers' => ['required','boolean'], 'settings.layout.title_page' => ['required','boolean'], 'settings.layout.copyright_page' => ['required','boolean'], 'settings.layout.chapter_new_page' => ['required','boolean'], 'settings.layout.include_cover' => ['required','boolean']]);
        $defaults = $this->settings($book); return ['metadata' => [...$defaults['metadata'], ...$v['settings']['metadata']], 'format' => [...$defaults['format'], ...$v['settings']['format']], 'layout' => [...$defaults['layout'], ...$v['settings']['layout']]];
    }

    private function statistics(Book $book): array { $text = $book->blocks()->where('status','!=','deleted')->pluck('text_plain')->implode("\n"); preg_match_all('/\S+/u', $text, $words); return ['blocks' => $book->blocks()->where('status','!=','deleted')->count(), 'words' => count($words[0]), 'has_cover' => filled($book->cover_img)]; }
}
