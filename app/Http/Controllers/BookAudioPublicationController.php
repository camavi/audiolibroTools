<?php

namespace App\Http\Controllers;

use App\Models\Book;
use App\Models\BookAudioPublication;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class BookAudioPublicationController extends Controller
{
    public function index(string $keyBook): JsonResponse
    {
        $book = $this->book($keyBook);

        return response()->json(['data' => ['releases' => BookAudioPublication::query()->where('book_id', $book->id)->latest('version_number')->get()->map(fn ($release) => $this->serialize($book, $release))->values()]]);
    }

    public function store(Request $request, string $keyBook, DashboardBookController $audio): JsonResponse
    {
        $book = $this->book($keyBook);
        $data = $request->validate(['edition_id' => ['nullable', 'integer'], 'label' => ['nullable', 'string', 'max:120']]);
        $edition = isset($data['edition_id']) ? $book->editions()->findOrFail($data['edition_id']) : $book->editions()->firstOrCreate(['locale' => strtolower($book->lang ?: 'en')], ['name' => $book->name, 'status' => 'ready', 'is_original' => true]);
        $snapshot = $audio->freezeAudioTimeline($book, $edition);
        $release = DB::transaction(function () use ($book, $edition, $data, $snapshot): BookAudioPublication {
            $version = (int) BookAudioPublication::query()->where('book_edition_id', $edition->id)->lockForUpdate()->max('version_number') + 1;

            return BookAudioPublication::query()->create(['book_id' => $book->id, 'book_edition_id' => $edition->id, 'version_number' => $version, 'label' => $data['label'] ?? null, 'status' => 'building', 'is_online' => true, 'timeline_snapshot_json' => $snapshot, 'masters_json' => [], 'created_by' => auth()->id()]);
        });

        $this->render($book, $release, $audio);

        return response()->json(['data' => ['release' => $this->serialize($book, $release)]], $release->status === 'ready' ? 201 : 422);
    }

    public function retry(string $keyBook, BookAudioPublication $release, DashboardBookController $audio): JsonResponse
    {
        $book = $this->book($keyBook);
        abort_unless($release->book_id === $book->id && $release->status === 'failed', 422, 'Only failed releases can be retried.');
        $release->forceFill(['status' => 'building', 'failure_message' => null])->save();
        $this->render($book, $release, $audio);

        return response()->json(['data' => ['release' => $this->serialize($book, $release)]], $release->status === 'ready' ? 200 : 422);
    }

    public function updateAvailability(Request $request, string $keyBook, BookAudioPublication $release): JsonResponse
    {
        $book = $this->book($keyBook);
        abort_unless($release->book_id === $book->id, 404);
        abort_unless($release->status === 'ready', 422, 'Only ready releases can be made available online.');
        $data = $request->validate(['is_online' => ['required', 'boolean']]);
        $release->update(['is_online' => $data['is_online']]);

        return response()->json(['data' => ['release' => $this->serialize($book, $release)]]);
    }

    public function download(string $keyBook, BookAudioPublication $release, string $track)
    {
        $book = $this->book($keyBook);
        abort_unless($release->book_id === $book->id, 404);
        $path = data_get($release->masters_json, "$track.path");
        abort_unless($path && Storage::disk('public')->exists($path), 404);

        return response()->download(Storage::disk('public')->path($path), basename($path), ['Content-Type' => 'audio/wav']);
    }

    private function book(string $keyBook): Book
    {
        return Book::query()->where('account_id', auth()->id())->where('key_book', $keyBook)->firstOrFail();
    }

    private function serialize(Book $book, BookAudioPublication $release): array
    {
        $track = fn ($key) => ($path = data_get($release->masters_json, "$key.path")) && Storage::disk('public')->exists($path) ? ['size_bytes' => Storage::disk('public')->size($path), 'download_url' => route('dashboard.api.books.audio-releases.download', ['keyBook' => $book->key_book, 'release' => $release, 'track' => $key], false)] : null;

        return [
            'id' => $release->id,
            'version_number' => $release->version_number,
            'label' => $release->label,
            'status' => $release->status,
            'is_online' => $release->is_online,
            'duration_ms' => $release->duration_ms,
            'published_at' => $release->published_at?->toISOString(),
            'failure_message' => $release->failure_message,
            'can_retry' => $release->status === 'failed',
            'public_url' => $release->is_online && $release->status === 'ready'
                ? route('public.audiobooks.show', ['keyBook' => $book->key_book, 'release' => $release], false)
                : null,
            'masters' => collect(['voice', 'music', 'fx'])->mapWithKeys(fn ($key) => [$key => $track($key)])->all(),
        ];
    }

    private function render(Book $book, BookAudioPublication $release, DashboardBookController $audio): void
    {
        try {
            $rendered = $audio->renderFrozenAudioTimeline($book, $release->timeline_snapshot_json ?? [], $release->version_number);
            $release->forceFill(['masters_json' => $rendered['channels'], 'duration_ms' => $rendered['duration_ms'], 'status' => 'ready', 'failure_message' => null, 'published_at' => now()])->save();
        } catch (\Throwable $exception) {
            report($exception);
            $release->forceFill(['status' => 'failed', 'is_online' => false, 'failure_message' => mb_substr($exception->getMessage(), 0, 1000)])->save();
        }
    }
}
