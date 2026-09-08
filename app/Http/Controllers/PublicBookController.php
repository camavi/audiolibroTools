<?php

namespace App\Http\Controllers;

use App\Models\Book;
use App\Models\BookPublication;
use App\Models\BookAudioPublication;
use App\Services\PublicBookAccessService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class PublicBookController extends Controller
{
    public function show(Request $request, string $keyBook, PublicBookAccessService $access)
    {
        $book = $this->book($request, $keyBook, $access);
        $publication = $book->publications()->where('status', 'ready')->where('is_online', true)->latest('published_at')->first();
        $audio = BookAudioPublication::query()->where('book_id', $book->id)->where('status', 'ready')->where('is_online', true)->latest('published_at')->first();
        abort_unless($publication || $audio, 404);

        return view('public-book', compact('book', 'publication', 'audio'));
    }

    public function download(Request $request, string $keyBook, BookPublication $publication, string $format, PublicBookAccessService $access)
    {
        $book = $this->book($request, $keyBook, $access);
        abort_unless($publication->book_id === $book->id && $publication->status === 'ready' && $publication->is_online, 404);
        $path = $format === 'epub' ? $publication->epub_file_path : $publication->pdf_file_path;
        abort_unless($path && Storage::disk('public')->exists($path), 404);

        return response()->download(Storage::disk('public')->path($path), basename($path), ['Content-Type' => $format === 'epub' ? 'application/epub+zip' : 'application/pdf']);
    }

    private function book(Request $request, string $keyBook, PublicBookAccessService $access): Book
    {
        $book = Book::query()->where('key_book', $keyBook)->firstOrFail();
        abort_unless($access->allows($book, $request), 404);
        return $book;
    }
}
