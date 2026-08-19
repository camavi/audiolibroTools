<?php

namespace App\Services;

class AudioTextSegmenter
{
    public const DEFAULT_PAUSES = [
        'comma_ms' => 250, 'semicolon_ms' => 750, 'sentence_ms' => 500,
        'newline_ms' => 1000, 'ellipsis_ms' => 800, 'dash_ms' => 350,
        'min_words' => 12,
        'split_characters' => ',;:.!?…—-',
    ];

    /** @return array<int, array{text:string,source_text:string,start:int,end:int,pause_after_ms:int}> */
    public function split(string $text, array $settings = []): array
    {
        $settings = [...self::DEFAULT_PAUSES, ...array_intersect_key($settings, self::DEFAULT_PAUSES)];
        $splitCharacters = preg_replace('/\s+/u', '', (string) $settings['split_characters']) ?? '';
        $quotedCharacters = preg_quote($splitCharacters, '/');
        $splitPattern = $quotedCharacters === ''
            ? '/(?<=\R)|(?=\R)/u'
            : '/(?<=['.$quotedCharacters.'])|(?<=\R)|(?=\R)/u';
        $parts = preg_split($splitPattern, $text, -1, PREG_SPLIT_NO_EMPTY | PREG_SPLIT_OFFSET_CAPTURE) ?: [];
        $segments = [];
        foreach ($parts as [$sourceText, $offset]) {
            $sourceText = (string) $sourceText;
            if (trim($sourceText) === '') {
                if ($segments) $segments[array_key_last($segments)]['pause_after_ms'] = max($segments[array_key_last($segments)]['pause_after_ms'], (int) $settings['newline_ms']);
                continue;
            }
            $trailingPattern = $quotedCharacters === '' ? null : '/(['.$quotedCharacters.'])\s*$/u';
            $trailingPattern ? preg_match($trailingPattern, $sourceText, $delimiter) : $delimiter = [];
            $mark = $delimiter[1] ?? '';
            $spoken = trim($quotedCharacters === '' ? $sourceText : (preg_replace('/['.$quotedCharacters.']+\s*$/u', '', $sourceText) ?? $sourceText));
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
        $segments = $segments ?: [['text' => trim($text), 'source_text' => $text, 'start' => 0, 'end' => mb_strlen($text, 'UTF-8'), 'pause_after_ms' => 0]];

        return $this->mergeShortSegments($segments, max(1, (int) $settings['min_words']));
    }

    /** @param array<int, array{text:string,source_text:string,start:int,end:int,pause_after_ms:int}> $segments */
    private function mergeShortSegments(array $segments, int $minWords): array
    {
        $groups = [];
        $current = null;

        foreach ($segments as $segment) {
            if ($current === null) {
                $current = $segment;
            } else {
                // Keep the punctuation between the original split points: it
                // becomes internal text for Qwen and preserves its prosody.
                $current['source_text'] .= $segment['source_text'];
                $current['text'] = trim($current['source_text']);
                $current['end'] = $segment['end'];
                $current['pause_after_ms'] = $segment['pause_after_ms'];
            }

            if ($this->wordCount($current['text']) >= $minWords) {
                $groups[] = $current;
                $current = null;
            }
        }

        if ($current !== null) {
            if ($groups) {
                $last = array_key_last($groups);
                $groups[$last]['source_text'] .= $current['source_text'];
                $groups[$last]['text'] = trim($groups[$last]['source_text']);
                $groups[$last]['end'] = $current['end'];
                $groups[$last]['pause_after_ms'] = $current['pause_after_ms'];
            } else {
                // A whole paragraph shorter than the minimum has no adjacent
                // part in this block to merge with, so it remains intact.
                $groups[] = $current;
            }
        }

        return $groups;
    }

    private function wordCount(string $text): int
    {
        return preg_match_all("/[\\p{L}\\p{N}]+(?:['’][\\p{L}\\p{N}]+)*/u", $text) ?: 0;
    }

}
