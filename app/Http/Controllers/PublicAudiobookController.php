<?php

namespace App\Http\Controllers;

use App\Models\Book;
use App\Models\BookAudioPublication;
use App\Services\PublicBookAccessService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class PublicAudiobookController extends Controller
{
    public function show(Request $request, string $keyBook, BookAudioPublication $release, PublicBookAccessService $access)
    {
        $book = $this->book($request, $keyBook, $release, $access);
        $tracks = collect(['voice', 'music', 'fx'])
            ->filter(fn (string $track) => ($path = data_get($release->masters_json, "{$track}.path")) && Storage::disk('public')->exists($path))
            ->mapWithKeys(fn (string $track) => [$track => route('public.audiobooks.stream', ['keyBook' => $book->key_book, 'release' => $release, 'track' => $track]).($book->public_access === 'invite' ? '?access='.$book->public_share_token : '')])
            ->all();

        return view('public-audiobook', compact('book', 'release', 'tracks'));
    }

    public function stream(Request $request, string $keyBook, BookAudioPublication $release, string $track, PublicBookAccessService $access)
    {
        $this->book($request, $keyBook, $release, $access);
        $path = data_get($release->masters_json, "$track.path");
        abort_unless($path && Storage::disk('public')->exists($path), 404);

        return response()->file(Storage::disk('public')->path($path), ['Content-Type' => 'audio/wav', 'Accept-Ranges' => 'bytes']);
    }

    private function book(Request $request, string $keyBook, BookAudioPublication $release, PublicBookAccessService $access): Book
    {
        $book = Book::query()->where('key_book', $keyBook)->firstOrFail();
        abort_unless($access->allows($book, $request) && $release->book_id === $book->id && $release->is_online && $release->status === 'ready', 404);

        return $book;
    }
}
