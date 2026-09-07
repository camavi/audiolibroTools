<?php

namespace App\Http\Controllers;

use App\Models\Book;
use App\Models\BookBlock;
use App\Models\BookBlockTranslation;
use App\Models\BookEdition;
use App\Models\BookPublication;
use App\Services\BookEpubService;
use App\Services\BookPdfService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class BookPublicationController extends Controller
{
    public function index(string $keyBook): JsonResponse
    {
        $book = $this->book($keyBook);

        return response()->json(['data' => ['publications' => $book->publications()->latest('version_number')->get()->map(fn (BookPublication $publication) => $this->serialize($book, $publication))->values()]]);
    }

    public function store(Request $request, string $keyBook, BookEpubService $epub, BookPdfService $pdf): JsonResponse
    {
        $book = $this->book($keyBook);
        $data = $request->validate(['edition_id' => ['nullable', 'integer'], 'label' => ['nullable', 'string', 'max:120']]);
        $edition = isset($data['edition_id'])
            ? $book->editions()->whereKey($data['edition_id'])->firstOrFail()
            : $this->originalEdition($book);
        $blocks = $this->editionBlocks($book, $edition);

        $publication = DB::transaction(function () use ($book, $edition, $data, $blocks): BookPublication {
            $version = (int) $book->publications()->where('book_edition_id', $edition->id)->lockForUpdate()->max('version_number') + 1;

            return BookPublication::query()->create([
                'book_id' => $book->id,
                'book_edition_id' => $edition->id,
                'version_number' => $version,
                'label' => $data['label'] ?? null,
                'status' => 'building',
                'snapshot_json' => $this->snapshot($book, $edition, $blocks),
                'created_by' => auth()->id(),
            ]);
        });

        try {
            $epubPath = $epub->build($book, $this->epubSettings($book, $edition), $publication->version_number, $blocks);
            $pdfPath = $pdf->store($book, $this->pdfSettings($book, $edition), $publication->version_number, $blocks);
            $publication->forceFill(['epub_file_path' => $epubPath, 'pdf_file_path' => $pdfPath, 'status' => 'ready', 'published_at' => now()])->save();
        } catch (\Throwable $exception) {
            $publication->forceFill(['status' => 'failed'])->save();
            throw $exception;
        }

        return response()->json(['data' => ['publication' => $this->serialize($book, $publication)]], 201);
    }

    public function download(string $keyBook, BookPublication $publication, string $format)
    {
        $book = $this->book($keyBook);
        abort_unless($publication->book_id === $book->id, 404);

        $path = match ($format) {
            'epub' => $publication->epub_file_path,
            'pdf' => $publication->pdf_file_path,
            default => null,
        };
        abort_unless($path && Storage::disk('public')->exists($path), 404);

        return response()->download(
            Storage::disk('public')->path($path),
            pathinfo($path, PATHINFO_BASENAME),
            ['Content-Type' => $format === 'epub' ? 'application/epub+zip' : 'application/pdf'],
        );
    }

    public function updateAvailability(Request $request, string $keyBook, BookPublication $publication): JsonResponse
    {
        $book = $this->book($keyBook);
        abort_unless($publication->book_id === $book->id, 404);
        $data = $request->validate(['is_online' => ['required', 'boolean']]);
        $publication->forceFill(['is_online' => $data['is_online']])->save();

        return response()->json(['data' => ['publication' => $this->serialize($book, $publication)]]);
    }

    private function book(string $keyBook): Book
    {
        return Book::query()->where('account_id', auth()->id())->where('key_book', $keyBook)->firstOrFail();
    }

    private function originalEdition(Book $book): BookEdition
    {
        return $book->editions()->firstOrCreate(
            ['locale' => strtolower($book->lang ?: 'en')],
            ['name' => $book->name, 'status' => 'ready', 'is_original' => true],
        );
    }

    /** @return Collection<int, BookBlock> */
    private function editionBlocks(Book $book, BookEdition $edition)
    {
        $blocks = $book->blocks()->where('status', '!=', 'deleted')->get();
        if ($edition->is_original) {
            return $blocks;
        }

        $translations = BookBlockTranslation::query()
            ->where('book_id', $book->id)
            ->where('target_locale', $edition->locale)
            ->where('status', 'approved')
            ->whereIn('source_book_block_version_id', $blocks->pluck('current_version_id')->filter())
            ->latest('updated_at')->latest('id')->get()->groupBy('book_block_id')
            ->map(fn ($items) => $items->first());

        return $blocks->map(function (BookBlock $block) use ($translations): BookBlock {
            $copy = clone $block;
            if ($translation = $translations->get($block->id)) {
                $copy->text_plain = $translation->translated_text;
            }

            return $copy;
        });
    }

    private function snapshot(Book $book, BookEdition $edition, iterable $blocks): array
    {
        return [
            'book' => ['name' => $book->name, 'description' => $book->description, 'locale' => $edition->locale, 'cover_img' => $book->cover_img],
            'blocks' => collect($blocks)->map(fn (BookBlock $block) => ['uuid' => $block->block_uuid, 'type' => $block->type, 'sort_order' => $block->sort_order, 'content_json' => $block->content_json, 'text_plain' => $block->text_plain, 'version_id' => $block->current_version_id])->values()->all(),
            'created_at' => now()->toISOString(),
        ];
    }

    private function epubSettings(Book $book, BookEdition $edition): array
    {
        $stored = $book->epub_settings_json ?? [];

        return ['metadata' => ['title' => $stored['metadata']['title'] ?? $book->name, 'subtitle' => $stored['metadata']['subtitle'] ?? '', 'author' => $stored['metadata']['author'] ?? '', 'publisher' => $stored['metadata']['publisher'] ?? '', 'publication_date' => $stored['metadata']['publication_date'] ?? now()->toDateString(), 'identifier' => $stored['metadata']['identifier'] ?? '', 'language' => $edition->locale, 'description' => $stored['metadata']['description'] ?? ($book->description ?: ''), 'subjects' => array_values($stored['metadata']['subjects'] ?? []), 'rights' => $stored['metadata']['rights'] ?? ''], 'reading' => ['layout' => 'reflowable', 'direction' => in_array($stored['reading']['direction'] ?? null, ['auto', 'ltr', 'rtl'], true) ? $stored['reading']['direction'] : 'auto', 'include_toc' => (bool) ($stored['reading']['include_toc'] ?? true), 'include_title_page' => (bool) ($stored['reading']['include_title_page'] ?? true), 'chapter_break' => in_array($stored['reading']['chapter_break'] ?? null, ['heading', 'single'], true) ? $stored['reading']['chapter_break'] : 'heading']];
    }

    private function pdfSettings(Book $book, BookEdition $edition): array
    {
        $stored = $book->pdf_settings_json ?? [];

        return ['metadata' => ['title' => $stored['metadata']['title'] ?? $book->name, 'subtitle' => $stored['metadata']['subtitle'] ?? '', 'author' => $stored['metadata']['author'] ?? '', 'publisher' => $stored['metadata']['publisher'] ?? '', 'rights' => $stored['metadata']['rights'] ?? ''], 'format' => ['size' => in_array($stored['format']['size'] ?? null, ['a4', 'a5', 'a6', 'letter', 'six_by_nine', 'custom'], true) ? $stored['format']['size'] : 'a5', 'width_mm' => $stored['format']['width_mm'] ?? 148, 'height_mm' => $stored['format']['height_mm'] ?? 210], 'layout' => ['margin_top' => $stored['layout']['margin_top'] ?? 20, 'margin_bottom' => $stored['layout']['margin_bottom'] ?? 20, 'margin_inside' => $stored['layout']['margin_inside'] ?? 18, 'margin_outside' => $stored['layout']['margin_outside'] ?? 15, 'alignment' => in_array($stored['layout']['alignment'] ?? null, ['left', 'justify'], true) ? $stored['layout']['alignment'] : 'justify', 'page_numbers' => (bool) ($stored['layout']['page_numbers'] ?? true), 'title_page' => (bool) ($stored['layout']['title_page'] ?? true), 'copyright_page' => (bool) ($stored['layout']['copyright_page'] ?? true), 'chapter_new_page' => (bool) ($stored['layout']['chapter_new_page'] ?? true), 'include_cover' => (bool) ($stored['layout']['include_cover'] ?? true)]];
    }

    private function serialize(Book $book, BookPublication $publication): array
    {
        $download = fn (string $format, ?string $path) => $path && Storage::disk('public')->exists($path)
            ? route('dashboard.api.books.publications.download', ['keyBook' => $book->key_book, 'publication' => $publication, 'format' => $format], false)
            : null;

        $file = fn (?string $path) => $path && Storage::disk('public')->exists($path) ? ['name' => pathinfo($path, PATHINFO_BASENAME), 'size_bytes' => Storage::disk('public')->size($path)] : null;

        return ['id' => $publication->id, 'edition_id' => $publication->book_edition_id, 'version_number' => $publication->version_number, 'label' => $publication->label, 'status' => $publication->status, 'is_online' => $publication->is_online, 'epub' => [...($file($publication->epub_file_path) ?? []), 'download_url' => $download('epub', $publication->epub_file_path)], 'pdf' => [...($file($publication->pdf_file_path) ?? []), 'download_url' => $download('pdf', $publication->pdf_file_path)], 'audiobook_file_path' => $publication->audiobook_file_path, 'published_at' => $publication->published_at?->toISOString(), 'created_at' => $publication->created_at?->toISOString()];
    }
}
