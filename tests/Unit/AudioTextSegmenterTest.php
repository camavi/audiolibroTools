<?php

namespace Tests\Unit;

use App\Services\AudioTextSegmenter;
use PHPUnit\Framework\TestCase;

class AudioTextSegmenterTest extends TestCase
{
    public function test_it_splits_punctuation_and_preserves_configured_pauses(): void
    {
        $parts = (new AudioTextSegmenter())->split('Ciao, mondo; fine.', [
            'comma_ms' => 120,
            'semicolon_ms' => 420,
            'sentence_ms' => 700,
        ]);

        $this->assertSame(['Ciao', 'mondo', 'fine'], array_column($parts, 'text'));
        $this->assertSame([120, 420, 700], array_column($parts, 'pause_after_ms'));
        $this->assertSame('Ciao,', $parts[0]['source_text']);
    }

    public function test_it_returns_unicode_character_offsets_for_the_manuscript(): void
    {
        $parts = (new AudioTextSegmenter())->split('È, ciao.');

        $this->assertSame(0, $parts[0]['start']);
        $this->assertSame(2, $parts[0]['end']);
        // "È," is two Unicode characters even though its UTF-8 byte length is three.
        $this->assertSame(2, $parts[1]['start']);
    }
}
