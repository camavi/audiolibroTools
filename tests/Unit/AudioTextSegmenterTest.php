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
            'min_words' => 1,
        ]);

        $this->assertSame(['Ciao', 'mondo', 'fine'], array_column($parts, 'text'));
        $this->assertSame([120, 420, 700], array_column($parts, 'pause_after_ms'));
        $this->assertSame('Ciao,', $parts[0]['source_text']);
    }

    public function test_it_returns_unicode_character_offsets_for_the_manuscript(): void
    {
        $parts = (new AudioTextSegmenter())->split('È, ciao.', ['min_words' => 1]);

        $this->assertSame(0, $parts[0]['start']);
        $this->assertSame(2, $parts[0]['end']);
        // "È," is two Unicode characters even though its UTF-8 byte length is three.
        $this->assertSame(2, $parts[1]['start']);
    }

    public function test_it_groups_punctuation_splits_until_the_minimum_word_count(): void
    {
        $parts = (new AudioTextSegmenter())->split(
            'Uno due tre, quattro cinque sei. Sette otto nove dieci undici dodici; tredici quattordici.',
            ['min_words' => 12],
        );

        $this->assertCount(1, $parts);
        $this->assertSame('Uno due tre, quattro cinque sei. Sette otto nove dieci undici dodici; tredici quattordici', $parts[0]['text']);
        $this->assertSame(500, $parts[0]['pause_after_ms']);
    }

    public function test_it_merges_a_short_last_group_with_the_previous_group(): void
    {
        $parts = (new AudioTextSegmenter())->split(
            'Uno due tre quattro cinque sei sette otto nove dieci undici dodici. Tredici quattordici.',
            ['min_words' => 12],
        );

        $this->assertCount(1, $parts);
        $this->assertSame('Uno due tre quattro cinque sei sette otto nove dieci undici dodici. Tredici quattordici', $parts[0]['text']);
    }

    public function test_it_keeps_a_short_completed_sentence_with_the_previous_group(): void
    {
        $parts = (new AudioTextSegmenter())->split(
            'Uno due tre quattro cinque sei sette otto nove dieci undici dodici, Gesù. Tredici quattordici quindici sedici diciassette diciotto diciannove venti ventuno ventidue ventitré ventiquattro.',
            ['min_words' => 12],
        );

        $this->assertCount(2, $parts);
        $this->assertSame('Uno due tre quattro cinque sei sette otto nove dieci undici dodici, Gesù', $parts[0]['text']);
        $this->assertSame('Tredici quattordici quindici sedici diciassette diciotto diciannove venti ventuno ventidue ventitré ventiquattro', $parts[1]['text']);
        $this->assertSame(500, $parts[0]['pause_after_ms']);
    }

}
