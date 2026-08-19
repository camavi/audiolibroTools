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
        $trailingDelimiterPattern = $quotedCharacters === '' ? null : '/['.$quotedCharacters.']+\s*$/u';
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
            $spoken = trim($trailingDelimiterPattern ? (preg_replace($trailingDelimiterPattern, '', $sourceText) ?? $sourceText) : $sourceText);
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

        return $this->mergeShortSegments($segments, max(1, (int) $settings['min_words']), $trailingDelimiterPattern);
    }

    /** @param array<int, array{text:string,source_text:string,start:int,end:int,pause_after_ms:int}> $segments */
    private function mergeShortSegments(array $segments, int $minWords, ?string $trailingDelimiterPattern): array
    {
        $groups = [];
        $current = null;

        foreach ($segments as $segment) {
            if ($current === null) {
                // A tiny completed sentence after a full group sounds like an
                // orphaned request (for example: ", Gesù."). Keep it with the
                // preceding phrase instead of adding a pause before that word.
                if ($groups && $this->wordCount($segment['text']) < $minWords && preg_match('/[.!?…]\s*$/u', $segment['source_text'])) {
                    $last = array_key_last($groups);
                    $this->appendSegment($groups[$last], $segment, $trailingDelimiterPattern);
                    continue;
                }
                $current = $segment;
            } else {
                // Keep the punctuation between the original split points: it
                // becomes internal text for Qwen and preserves its prosody.
                $this->appendSegment($current, $segment, $trailingDelimiterPattern);
            }

            if ($this->wordCount($current['text']) >= $minWords) {
                $groups[] = $current;
                $current = null;
            }
        }

        if ($current !== null) {
            if ($groups) {
                $last = array_key_last($groups);
                $this->appendSegment($groups[$last], $current, $trailingDelimiterPattern);
            } else {
                // A whole paragraph shorter than the minimum has no adjacent
                // part in this block to merge with, so it remains intact.
                $groups[] = $current;
            }
        }

        return $groups;
    }

    /** @param array{text:string,source_text:string,start:int,end:int,pause_after_ms:int} $target @param array{text:string,source_text:string,start:int,end:int,pause_after_ms:int} $segment */
    private function appendSegment(array &$target, array $segment, ?string $trailingDelimiterPattern): void
    {
        $target['source_text'] .= $segment['source_text'];
        $target['text'] = trim($trailingDelimiterPattern ? (preg_replace($trailingDelimiterPattern, '', $target['source_text']) ?? $target['source_text']) : $target['source_text']);
        $target['end'] = $segment['end'];
        $target['pause_after_ms'] = $segment['pause_after_ms'];
    }

    private function wordCount(string $text): int
    {
        return preg_match_all("/[\\p{L}\\p{N}]+(?:['’][\\p{L}\\p{N}]+)*/u", $text) ?: 0;
    }

}
