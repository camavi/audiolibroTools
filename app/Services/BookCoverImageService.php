<?php

namespace App\Services;

use App\Models\Book;
use App\Models\BookDesignAsset;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class BookCoverImageService
{
    /**
     * Generate a portrait cover asset and keep the generated binary in the
     * same library as manually uploaded images.
     */
    public function generate(Book $book, string $prompt): BookDesignAsset
    {
        $provider = collect(config('ai_providers.defaults', []))
            ->firstWhere('provider_key', 'at-openai');
        $apiKey = $provider['managed_api_key'] ?? null;

        if (! filled($apiKey)) {
            $this->fail('Image generation is not configured. Add AT_OPENAI_API_KEY to enable it.');
        }

        $baseUrl = rtrim($provider['base_url'] ?? 'https://api.openai.com/v1', '/');
        $model = config('ai_providers.image_model', 'gpt-image-1');
        $response = Http::withToken($apiKey)
            ->acceptJson()
            ->timeout(180)
            ->post("{$baseUrl}/images/generations", [
                'model' => $model,
                'prompt' => $prompt,
                'size' => '1024x1536',
                'quality' => 'medium',
                'output_format' => 'png',
            ]);

        if ($response->failed()) {
            $this->fail('Image generation failed: '.$response->json('error.message', 'OpenAI did not return an image.'));
        }

        $image = base64_decode((string) $response->json('data.0.b64_json'), true);
        if ($image === false || $image === '') {
            $this->fail('Image generation returned no usable image data.');
        }

        $path = "book-designs/{$book->key_book}/generated/".Str::uuid().'.png';
        Storage::disk('public')->put($path, $image);
        $dimensions = @getimagesize(Storage::disk('public')->path($path)) ?: [null, null];

        return BookDesignAsset::query()->create([
            'book_id' => $book->id,
            'account_id' => $book->account_id,
            'name' => 'Generated cover · '.now()->format('Y-m-d H:i'),
            'image_path' => $path,
            'mime_type' => 'image/png',
            'width' => $dimensions[0],
            'height' => $dimensions[1],
            'metadata_json' => [
                'source' => 'openai',
                'model' => $model,
                'prompt' => $prompt,
                'size' => '1024x1536',
            ],
            'created_by' => auth()->id(),
        ]);
    }

    private function fail(string $message): never
    {
        throw new HttpResponseException(response()->json([
            'message' => $message,
            'errors' => ['image' => [$message]],
        ], 422));
    }
}
