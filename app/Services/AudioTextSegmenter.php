<?php

namespace App\Services;

class AudioTextSegmenter
{
    public const DEFAULT_PAUSES = [
        'comma_ms' => 250, 'semicolon_ms' => 750, 'sentence_ms' => 500,
        'newline_ms' => 1000, 'ellipsis_ms' => 800, 'dash_ms' => 350,
    ];

    /** @return array<int, array{text:string,source_text:string,start:int,end:int,pause_after_ms:int}> */
    public function split(string $text, array $settings = []): array
    {
        $settings = [...self::DEFAULT_PAUSES, ...array_intersect_key($settings, self::DEFAULT_PAUSES)];
        $parts = preg_split('/(?<=[,;:.!?…])|(?<=\R)|(?=\R)/u', $text, -1, PREG_SPLIT_NO_EMPTY | PREG_SPLIT_OFFSET_CAPTURE) ?: [];
        $segments = [];
        foreach ($parts as [$sourceText, $offset]) {
            $sourceText = (string) $sourceText;
            if (trim($sourceText) === '') {
                if ($segments) $segments[array_key_last($segments)]['pause_after_ms'] = max($segments[array_key_last($segments)]['pause_after_ms'], (int) $settings['newline_ms']);
                continue;
            }
            preg_match('/([,;:.!?…—-])\s*$/u', $sourceText, $delimiter);
            $mark = $delimiter[1] ?? '';
            $spoken = trim(preg_replace('/[,;:.!?…—-]+\s*$/u', '', $sourceText) ?? $sourceText);
            if ($spoken === '') continue;
            $pause = match ($mark) {
                ',' => (int) $settings['comma_ms'], ';', ':' => (int) $settings['semicolon_ms'],
                '…' => (int) $settings['ellipsis_ms'], '—', '-' => (int) $settings['dash_ms'],
                '.', '!', '?' => (int) $settings['sentence_ms'], default => 0,
            };
            // PREG_SPLIT_OFFSET_CAPTURE returns a byte offset. The editor and
            // browser strings use Unicode character offsets, so convert it here.
            $start = mb_strlen(substr($text, 0, (int) $offset), 'UTF-8');
            $segments[] = ['text' => $spoken, 'source_text' => $sourceText, 'start' => $start, 'end' => $start + mb_strlen($sourceText, 'UTF-8'), 'pause_after_ms' => $pause];
        }
        return $segments ?: [['text' => trim($text), 'source_text' => $text, 'start' => 0, 'end' => mb_strlen($text, 'UTF-8'), 'pause_after_ms' => 0]];
    }
}
