<?php

namespace App\Http\Controllers;

use App\Models\Book;
use App\Models\BookAudioPublication;
use Illuminate\Support\Facades\Storage;

class PublicAudiobookController extends Controller
{
    public function show(string $keyBook, BookAudioPublication $release)
    {
        $book = $this->book($keyBook, $release);
        $tracks = collect(['voice', 'music', 'fx'])
            ->filter(fn (string $track) => ($path = data_get($release->masters_json, "{$track}.path")) && Storage::disk('public')->exists($path))
            ->mapWithKeys(fn (string $track) => [$track => route('public.audiobooks.stream', ['keyBook' => $book->key_book, 'release' => $release, 'track' => $track])])
            ->all();

        return view('public-audiobook', compact('book', 'release', 'tracks'));
    }

    public function stream(string $keyBook, BookAudioPublication $release, string $track)
    {
        $this->book($keyBook, $release);
        $path = data_get($release->masters_json, "$track.path");
        abort_unless($path && Storage::disk('public')->exists($path), 404);

        return response()->file(Storage::disk('public')->path($path), ['Content-Type' => 'audio/wav', 'Accept-Ranges' => 'bytes']);
    }

    private function book(string $keyBook, BookAudioPublication $release): Book
    {
        $book = Book::query()->where('key_book', $keyBook)->firstOrFail();
        abort_unless($release->book_id === $book->id && $release->is_online && $release->status === 'ready', 404);

        return $book;
    }
}
