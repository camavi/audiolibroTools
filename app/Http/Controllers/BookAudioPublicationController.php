<?php

namespace App\Http\Controllers;

use App\Jobs\EncodeBookAudioPublicationMp3;
use App\Jobs\RenderBookAudioPublication;
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

            return BookAudioPublication::query()->create(['book_id' => $book->id, 'book_edition_id' => $edition->id, 'version_number' => $version, 'label' => $data['label'] ?? null, 'status' => 'queued', 'progress_percent' => 0, 'is_online' => true, 'timeline_snapshot_json' => $snapshot, 'masters_json' => [], 'created_by' => auth()->id()]);
        });

        RenderBookAudioPublication::dispatch($release->id);

        return response()->json(['data' => ['release' => $this->serialize($book, $release)]], 202);
    }

    public function retry(string $keyBook, BookAudioPublication $release): JsonResponse
    {
        $book = $this->book($keyBook);
        abort_unless($release->book_id === $book->id && $release->status === 'failed', 422, 'Only failed releases can be retried.');
        $release->forceFill(['status' => 'queued', 'progress_percent' => 0, 'failure_message' => null, 'started_at' => null, 'completed_at' => null])->save();
        RenderBookAudioPublication::dispatch($release->id);

        return response()->json(['data' => ['release' => $this->serialize($book, $release)]], 202);
    }

    public function requestMp3(string $keyBook, BookAudioPublication $release): JsonResponse
    {
        $book = $this->book($keyBook);
        abort_unless($release->book_id === $book->id && $release->status === 'ready', 422, 'Only ready releases can be converted to MP3.');

        $shouldDispatch = false;
        $release = DB::transaction(function () use ($release, &$shouldDispatch): BookAudioPublication {
            $locked = BookAudioPublication::query()->lockForUpdate()->findOrFail($release->id);
            if ($locked->mp3_status === 'ready' || in_array($locked->mp3_status, ['queued', 'building'], true)) {
                return $locked;
            }
            abort_unless(collect(['voice', 'music', 'fx'])->contains(fn (string $track): bool => filled(data_get($locked->masters_json, "{$track}.path"))), 422, 'No WAV master is available for MP3 conversion.');
            $locked->forceFill(['mp3_status' => 'queued', 'mp3_progress_percent' => 0, 'mp3_failure_message' => null])->save();
            $shouldDispatch = true;

            return $locked;
        });
        if ($shouldDispatch) {
            EncodeBookAudioPublicationMp3::dispatch($release->id);
        }

        return response()->json(['data' => ['release' => $this->serialize($book, $release)]], $shouldDispatch ? 202 : 200);
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

    public function download(Request $request, string $keyBook, BookAudioPublication $release, string $track)
    {
        $book = $this->book($keyBook);
        abort_unless($release->book_id === $book->id, 404);
        $format = $request->string('format', 'wav')->toString();
        abort_unless(in_array($format, ['wav', 'mp3'], true), 404);
        $path = data_get($release->masters_json, $format === 'mp3' ? "$track.mp3_path" : "$track.path");
        abort_unless($path && Storage::disk('public')->exists($path), 404);

        return response()->download(Storage::disk('public')->path($path), basename($path), ['Content-Type' => $format === 'mp3' ? 'audio/mpeg' : 'audio/wav']);
    }

    private function book(string $keyBook): Book
    {
        return Book::query()->where('account_id', auth()->id())->where('key_book', $keyBook)->firstOrFail();
    }

    private function serialize(Book $book, BookAudioPublication $release): array
    {
        $file = function (?string $path, string $track, string $format) use ($book, $release): ?array {
            if (! $path || ! Storage::disk('public')->exists($path)) {
                return null;
            }

            return [
                'size_bytes' => Storage::disk('public')->size($path),
                'download_url' => route('dashboard.api.books.audio-releases.download', ['keyBook' => $book->key_book, 'release' => $release, 'track' => $track], false).($format === 'mp3' ? '?format=mp3' : ''),
                'format' => $format,
            ];
        };
        $track = function (string $key) use ($release, $file): ?array {
            $wav = $file(data_get($release->masters_json, "$key.path"), $key, 'wav');
            if (! $wav) {
                return null;
            }
            $mp3 = $file(data_get($release->masters_json, "$key.mp3_path"), $key, 'mp3');

            return ['wav' => $wav, 'mp3' => $mp3];
        };

        return [
            'id' => $release->id,
            'version_number' => $release->version_number,
            'label' => $release->label,
            'status' => $release->status,
            'progress_percent' => (int) $release->progress_percent,
            'mp3_status' => $release->mp3_status,
            'mp3_progress_percent' => (int) $release->mp3_progress_percent,
            'mp3_failure_message' => $release->mp3_failure_message,
            'is_online' => $release->is_online,
            'duration_ms' => $release->duration_ms,
            'published_at' => $release->published_at?->toISOString(),
            'started_at' => $release->started_at?->toISOString(),
            'completed_at' => $release->completed_at?->toISOString(),
            'failure_message' => $release->failure_message,
            'can_retry' => $release->status === 'failed',
            'public_url' => $release->is_online && $release->status === 'ready'
                ? route('public.audiobooks.show', ['keyBook' => $book->key_book, 'release' => $release], false)
                : null,
            'masters' => collect(['voice', 'music', 'fx'])->mapWithKeys(fn ($key) => [$key => $track($key)])->all(),
        ];
    }

}
