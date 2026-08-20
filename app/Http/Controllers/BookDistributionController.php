<?php

namespace App\Http\Controllers;

use App\Models\Book;
use App\Models\BookDistributionConnection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BookDistributionController extends Controller
{
    public function index(string $keyBook): JsonResponse
    {
        $book = $this->book($keyBook);
        $connections = $book->distributionConnections->keyBy('provider_key');
        return response()->json(['data' => [
            'providers' => collect(config('distribution_providers'))->map(fn ($provider) => [...$provider, 'connection' => $this->connection($connections->get($provider['key']))])->values(),
            'readiness' => ['epub' => filled($book->epub_file_path), 'pdf' => filled($book->pdf_file_path), 'audiobook' => $book->audioSegments()->where('status', 'completed')->exists(), 'cover' => filled($book->cover_img)],
        ]]);
    }

    public function connect(Request $request, string $keyBook, string $providerKey): JsonResponse
    {
        $book = $this->book($keyBook); $provider = collect(config('distribution_providers'))->firstWhere('key', $providerKey); abort_unless($provider, 404);
        $data = $request->validate(['account_label' => ['nullable','string','max:120'], 'api_token' => ['nullable','string','max:5000']]);
        $connection = BookDistributionConnection::query()->firstOrNew(['book_id' => $book->id, 'provider_key' => $providerKey]);
        $connection->fill(['account_id' => $book->account_id, 'account_label' => $data['account_label'] ?? $connection->account_label, 'status' => $provider['connection_mode'] === 'manual' ? 'manual_ready' : 'connected', 'connected_at' => now()]);
        if (filled($data['api_token'] ?? null)) $connection->api_token = $data['api_token'];
        $connection->save();
        return response()->json(['data' => ['connection' => $this->connection($connection)]]);
    }

    public function disconnect(string $keyBook, string $providerKey): JsonResponse
    {
        $book = $this->book($keyBook); $book->distributionConnections()->where('provider_key', $providerKey)->delete();
        return response()->json(['data' => ['disconnected' => true]]);
    }

    private function book(string $keyBook): Book { return Book::query()->where('account_id', auth()->id())->where('key_book', $keyBook)->firstOrFail(); }
    private function connection(?BookDistributionConnection $connection): array { return ['status' => $connection?->status ?? 'not_connected', 'account_label' => $connection?->account_label, 'has_token' => filled($connection?->api_token), 'connected_at' => $connection?->connected_at?->toISOString(), 'last_published_at' => $connection?->last_published_at?->toISOString()]; }
}
