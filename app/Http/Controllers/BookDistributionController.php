<?php

namespace App\Http\Controllers;

use App\Models\Book;
use App\Models\BookDistributionConnection;
use App\Models\BookDistributionRelease;
use App\Models\BookPublication;
use App\Models\BookAudioPublication;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Storage;

class BookDistributionController extends Controller
{
    public function index(string $keyBook): JsonResponse
    {
        $book = $this->book($keyBook);
        $connections = $book->distributionConnections->keyBy('provider_key');
        return response()->json(['data' => [
            'providers' => collect(config('distribution_providers'))->map(fn ($provider) => $this->provider($provider, $connections->get($provider['key']), $book))->values(),
            'readiness' => ['epub' => $book->publications()->where('status', 'ready')->where('is_online', true)->whereNotNull('epub_file_path')->exists(), 'pdf' => $book->publications()->where('status', 'ready')->where('is_online', true)->whereNotNull('pdf_file_path')->exists(), 'audiobook' => \App\Models\BookAudioPublication::query()->where('book_id', $book->id)->where('status', 'ready')->where('is_online', true)->exists(), 'cover' => filled($book->cover_img)],
            'public_delivery' => ['access' => $book->public_access, 'url' => $book->public_access !== 'private' ? route('public.books.show', ['keyBook' => $book->key_book], false).($book->public_access === 'invite' ? '?access='.$book->public_share_token : '') : null],
        ]]);
    }

    public function publish(Request $request, string $keyBook, string $providerKey): JsonResponse
    {
        $book = $this->book($keyBook); $provider = collect(config('distribution_providers'))->firstWhere('key', $providerKey); abort_unless($provider, 404);
        $data = $request->validate(['publication_id' => ['nullable', 'integer'], 'audio_release_id' => ['nullable', 'integer']]);
        $publication = isset($data['publication_id']) ? BookPublication::query()->where('book_id', $book->id)->whereKey($data['publication_id'])->where('status', 'ready')->where('is_online', true)->firstOrFail() : null;
        $audio = isset($data['audio_release_id']) ? BookAudioPublication::query()->where('book_id', $book->id)->whereKey($data['audio_release_id'])->where('status', 'ready')->where('is_online', true)->firstOrFail() : null;
        abort_unless($publication || $audio, 422, 'Select at least one ready, online release.');
        if ($publication) abort_unless(collect($provider['types'])->intersect(['ebook', 'print'])->isNotEmpty(), 422, 'This provider does not accept book files.');
        if ($audio) abort_unless(in_array('audiobook', $provider['types'], true), 422, 'This provider does not accept audiobooks.');
        $connection = $book->distributionConnections()->where('provider_key', $providerKey)->first();
        abort_unless($connection, 422, 'Connect this provider before preparing a release.');
        $package = ['publication_id' => $publication?->id, 'audio_release_id' => $audio?->id, 'formats' => array_values(array_filter(['epub' => $publication?->epub_file_path, 'pdf' => $publication?->pdf_file_path, 'voice' => data_get($audio?->masters_json, 'voice.path'), 'music' => data_get($audio?->masters_json, 'music.path'), 'fx' => data_get($audio?->masters_json, 'fx.path')]))];
        abort_unless(in_array($connection->status, ['manual_ready', 'connected'], true), 422, 'Finish the provider setup before preparing a release.');
        $release = BookDistributionRelease::query()->create(['book_id' => $book->id, 'book_distribution_connection_id' => $connection->id, 'provider_key' => $providerKey, 'book_publication_id' => $publication?->id, 'book_audio_publication_id' => $audio?->id, 'status' => $provider['integration'] === 'direct_api' ? 'queued' : 'ready_to_upload', 'package_json' => $package, 'created_by' => auth()->id()]);
        return response()->json(['data' => ['release' => $this->release($release)]], 201);
    }

    public function updateRelease(Request $request, string $keyBook, BookDistributionRelease $release): JsonResponse
    {
        $book = $this->book($keyBook); abort_unless($release->book_id === $book->id, 404);
        $data = $request->validate(['status' => ['required', 'in:ready_to_upload,submitted,published,failed'], 'external_reference' => ['nullable', 'string', 'max:180'], 'failure_message' => ['nullable', 'string', 'max:2000']]);
        $release->fill($data);
        $release->published_at = $data['status'] === 'published' ? now() : $release->published_at;
        $release->save();
        return response()->json(['data' => ['release' => $this->release($release)]]);
    }

    public function downloadPackage(string $keyBook, BookDistributionRelease $release)
    {
        $book = $this->book($keyBook); abort_unless($release->book_id === $book->id, 404);
        $zipPath = tempnam(sys_get_temp_dir(), 'audiobook-distribution-');
        abort_unless($zipPath && class_exists(\ZipArchive::class), 500, 'ZIP packaging is unavailable.');
        $zip = new \ZipArchive(); $zip->open($zipPath, \ZipArchive::OVERWRITE);
        $manifest = ['book' => ['title' => $book->name, 'key' => $book->key_book], 'provider' => $release->provider_key, 'distribution_release_id' => $release->id, 'files' => []];
        foreach (($release->package_json['formats'] ?? []) as $path) {
            if (is_string($path) && Storage::disk('public')->exists($path)) { $name = basename($path); $zip->addFile(Storage::disk('public')->path($path), $name); $manifest['files'][] = $name; }
        }
        $zip->addFromString('manifest.json', json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)); $zip->close();
        return response()->download($zipPath, "{$book->key_book}-{$release->provider_key}-release-{$release->id}.zip", ['Content-Type' => 'application/zip'])->deleteFileAfterSend(true);
    }

    public function updatePublicDelivery(Request $request, string $keyBook): JsonResponse
    {
        $book = $this->book($keyBook);
        $data = $request->validate(['access' => ['required', 'in:private,public,invite'], 'rotate_link' => ['nullable', 'boolean']]);
        $book->public_access = $data['access'];
        if ($data['access'] === 'invite' && (! filled($book->public_share_token) || ($data['rotate_link'] ?? false))) $book->public_share_token = Str::random(48);
        if ($data['access'] === 'private') $book->public_share_token = null;
        $book->save();
        return response()->json(['data' => ['public_delivery' => ['access' => $book->public_access, 'url' => $book->public_access !== 'private' ? route('public.books.show', ['keyBook' => $book->key_book], false).($book->public_access === 'invite' ? '?access='.$book->public_share_token : '') : null]]]);
    }

    public function connect(Request $request, string $keyBook, string $providerKey): JsonResponse
    {
        $book = $this->book($keyBook); $provider = collect(config('distribution_providers'))->firstWhere('key', $providerKey); abort_unless($provider, 404);
        $data = $request->validate(['account_label' => ['nullable','string','max:120'], 'api_token' => ['prohibited']]);
        abort_if($provider['integration'] === 'partnership_api', 422, 'This provider requires an approved partnership before it can be set up.');
        $connection = BookDistributionConnection::query()->firstOrNew(['book_id' => $book->id, 'provider_key' => $providerKey]);
        $connection->fill(['account_id' => $book->account_id, 'account_label' => $data['account_label'] ?? $connection->account_label, 'status' => $provider['integration'] === 'file_feed' ? 'setup_requested' : 'manual_ready', 'connected_at' => now()]);
        $connection->save();
        return response()->json(['data' => ['connection' => $this->connection($connection)]]);
    }

    public function disconnect(string $keyBook, string $providerKey): JsonResponse
    {
        $book = $this->book($keyBook); $book->distributionConnections()->where('provider_key', $providerKey)->delete();
        return response()->json(['data' => ['disconnected' => true]]);
    }

    private function book(string $keyBook): Book { return Book::query()->where('account_id', auth()->id())->where('key_book', $keyBook)->firstOrFail(); }
    private function provider(array $provider, ?BookDistributionConnection $connection, Book $book): array
    {
        $comingSoon = $provider['integration'] === 'partnership_api';
        return [
            'key' => $provider['key'],
            'name' => $provider['name'],
            'types' => $provider['types'],
            'availability' => $comingSoon ? 'coming_soon' : $provider['integration'],
            'note' => $comingSoon ? 'This delivery channel is coming soon.' : $provider['note'],
            'connection' => $this->connection($connection),
            'releases' => BookDistributionRelease::query()->where('book_id', $book->id)->where('provider_key', $provider['key'])->latest()->take(4)->get()->map(fn ($release) => $this->release($release))->values(),
        ];
    }
    private function connection(?BookDistributionConnection $connection): array { return ['status' => $connection?->status ?? 'not_connected', 'account_label' => $connection?->account_label, 'has_token' => filled($connection?->api_token), 'connected_at' => $connection?->connected_at?->toISOString(), 'last_published_at' => $connection?->last_published_at?->toISOString()]; }
    private function release(BookDistributionRelease $release): array { return ['id' => $release->id, 'status' => $release->status, 'publication_id' => $release->book_publication_id, 'audio_release_id' => $release->book_audio_publication_id, 'failure_message' => $release->failure_message, 'external_reference' => $release->external_reference, 'package_url' => route('dashboard.api.books.distribution.releases.package', ['keyBook' => $release->book->key_book, 'release' => $release], false), 'published_at' => $release->published_at?->toISOString(), 'created_at' => $release->created_at?->toISOString()]; }
}
