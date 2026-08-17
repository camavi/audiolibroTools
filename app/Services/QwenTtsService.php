<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class QwenTtsService
{
    public function synthesize(string $text, string $language, string $voiceId, string $model = 'quality'): array
    {
        $response = $this->request()
            ->post($this->url('/v1/speech'), [
                'text' => $text,
                'language' => $language,
                'voice_id' => $voiceId,
                'model' => $model,
            ]);

        if ($response->failed()) {
            throw new RuntimeException($response->json('message') ?: 'Qwen TTS synthesis failed.');
        }

        $data = $response->json('data') ?: [];
        if (! filled($data['audio_url'] ?? null)) {
            throw new RuntimeException('Qwen TTS did not return an audio URL.');
        }

        return $data;
    }

    public function registerVoice(string $name, string $referencePath, ?string $referenceText = null): string
    {
        $response = $this->request()
            ->attach('file', fopen($referencePath, 'r'), basename($referencePath))
            ->post($this->url('/v1/voices'), [
                'name' => $name,
                'reference_text' => $referenceText,
            ]);

        if ($response->failed()) {
            throw new RuntimeException($response->json('message') ?: 'Qwen voice registration failed.');
        }

        $voiceId = $response->json('data.id');
        if (! filled($voiceId)) {
            throw new RuntimeException('Qwen did not return a voice identifier.');
        }

        return $voiceId;
    }

    public function transcribe(string $audioPath, ?string $language = null): array
    {
        $response = $this->request()
            ->post($this->url('/v1/transcribe'), [
                'audio_path' => $audioPath,
                'language' => $language,
            ]);

        if ($response->failed()) {
            throw new RuntimeException($response->json('message') ?: 'Local audio transcription failed.');
        }

        $data = $response->json('data') ?: [];
        if (! filled($data['text'] ?? null)) {
            throw new RuntimeException('Local transcription did not return text.');
        }

        return $data;
    }

    public function designVoice(string $text, string $language, string $instruct): array
    {
        $response = $this->request()->post($this->url('/v1/voice-design'), [
            'text' => $text,
            'language' => $language,
            'instruct' => $instruct,
        ]);

        if ($response->failed()) {
            throw new RuntimeException($response->json('message') ?: 'Qwen voice design failed.');
        }

        $data = $response->json('data') ?: [];
        if (! filled($data['audio_url'] ?? null)) {
            throw new RuntimeException('Qwen voice design did not return an audio URL.');
        }

        return $data;
    }

    public function download(string $audioUrl): string
    {
        $response = $this->request()->get($this->url($audioUrl));

        if ($response->failed()) {
            throw new RuntimeException('Unable to download generated Qwen audio.');
        }

        return $response->body();
    }

    private function request()
    {
        $request = Http::acceptJson()->timeout(config('tts.qwen.timeout', 900));
        $key = config('tts.qwen.api_key');

        return filled($key) ? $request->withToken($key) : $request;
    }

    private function url(string $path): string
    {
        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            return $path;
        }

        return rtrim(config('tts.qwen.base_url'), '/').'/'.ltrim($path, '/');
    }
}
