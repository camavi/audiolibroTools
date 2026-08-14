<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class CoquiTtsService
{
    public function synthesize(string $text, string $language, string $voiceId): array
    {
        $response = $this->request()
            ->post($this->url('/v1/speech'), [
                'text' => $text,
                'language' => $language,
                'voice_id' => $voiceId,
            ]);

        if ($response->failed()) {
            throw new RuntimeException($response->json('message') ?: 'Coqui TTS synthesis failed.');
        }

        $data = $response->json('data') ?: [];
        if (! filled($data['audio_url'] ?? null)) {
            throw new RuntimeException('Coqui TTS did not return an audio URL.');
        }

        return $data;
    }

    public function registerVoice(string $name, string $referencePath): string
    {
        $response = $this->request()
            ->attach('file', fopen($referencePath, 'r'), basename($referencePath))
            ->post($this->url('/v1/voices'), ['name' => $name]);

        if ($response->failed()) {
            throw new RuntimeException($response->json('message') ?: 'Coqui voice registration failed.');
        }

        $voiceId = $response->json('data.id');
        if (! filled($voiceId)) {
            throw new RuntimeException('Coqui did not return a voice identifier.');
        }

        return $voiceId;
    }

    public function download(string $audioUrl): string
    {
        $response = $this->request()->get($this->url($audioUrl));

        if ($response->failed()) {
            throw new RuntimeException('Unable to download generated Coqui audio.');
        }

        return $response->body();
    }

    private function request()
    {
        $request = Http::acceptJson()->timeout(config('tts.coqui.timeout', 900));
        $key = config('tts.coqui.api_key');

        return filled($key) ? $request->withToken($key) : $request;
    }

    private function url(string $path): string
    {
        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            return $path;
        }

        return rtrim(config('tts.coqui.base_url'), '/').'/'.ltrim($path, '/');
    }
}
