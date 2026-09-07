<?php

namespace App\Services;

use App\Models\Book;
use App\Models\BookBlock;
use Illuminate\Support\Str;

class ManuscriptReimportService
{
    /**
     * Exact content matches retain their existing block identity. Unmatched
     * neighbouring blocks are reported as modifications for user review.
     *
     * @param  array<int, array{type: string, text_plain: string, content_json: array<string, mixed>}>  $incoming
     * @return array{items: array<int, array<string, mixed>>, counts: array<string, int>}
     */
    public function compare(Book $book, array $incoming, BookBlockService $blocks): array
    {
        $existing = $book->blocks()->where('status', '!=', 'deleted')->withCount(['comments', 'reviews', 'translations', 'audioSegments'])->get()->values();
        $unused = $existing->keyBy('id')->all();
        $items = [];

        foreach ($incoming as $index => $candidate) {
            $hash = $blocks->hashContent($candidate['content_json'], $candidate['text_plain']);
            $match = collect($unused)->first(fn (BookBlock $block) => $block->content_hash === $hash);
            if ($match) {
                unset($unused[$match->id]);
                $items[] = ['kind' => 'unchanged', 'selection_key' => "incoming:{$index}", 'incoming_index' => $index, 'block_uuid' => $match->block_uuid, 'text' => $candidate['text_plain']];

                continue;
            }

            $neighbour = $existing->get($index);
            $items[] = [
                'kind' => $neighbour && isset($unused[$neighbour->id]) ? 'modified' : 'added',
                'selection_key' => "incoming:{$index}",
                'incoming_index' => $index,
                'block_uuid' => $neighbour?->block_uuid,
                'text' => $candidate['text_plain'],
                'previous_text' => $neighbour?->text_plain,
                'impact' => $neighbour ? $this->impact($neighbour) : null,
            ];
        }

        foreach ($unused as $block) {
            $items[] = ['kind' => 'removed', 'selection_key' => "removed:{$block->block_uuid}", 'incoming_index' => null, 'block_uuid' => $block->block_uuid, 'text' => $block->text_plain, 'impact' => $this->impact($block)];
        }

        return ['items' => $items, 'counts' => collect($items)->countBy('kind')->map(fn ($count) => (int) $count)->all() + ['unchanged' => 0, 'modified' => 0, 'added' => 0, 'removed' => 0]];
    }

    private function impact(BookBlock $block): array
    {
        return ['comments' => $block->comments_count, 'reviews' => $block->reviews_count, 'translations' => $block->translations_count, 'audio' => $block->audio_segments_count];
    }

    /** @param array<int, array{type: string, text_plain: string, content_json: array<string, mixed>}> $incoming */
    public function apply(Book $book, array $incoming, BookBlockService $blocks, ?int $userId = null, ?array $selectedItemKeys = null): array
    {
        $comparison = $this->compare($book, $incoming, $blocks);
        $byIndex = collect($comparison['items'])->keyBy('incoming_index');
        $selected = $selectedItemKeys === null ? null : array_fill_keys($selectedItemKeys, true);
        $deleted = [];

        foreach ($incoming as $index => $candidate) {
            $item = $byIndex->get($index);
            if ($item['kind'] !== 'unchanged' && $selected !== null && ! isset($selected[$item['selection_key']])) {
                continue;
            }
            $existing = $item && $item['block_uuid'] ? $book->blocks()->where('block_uuid', $item['block_uuid'])->first() : null;
            $payload = [...$candidate, 'sort_order' => ($index + 1) * 1000, 'source' => 'import'];
            if ($existing) {
                $payload['block_uuid'] = $existing->block_uuid;
                $payload['base_version_id'] = $existing->current_version_id;
            } else {
                $payload['block_uuid'] = (string) Str::ulid();
            }
            $blocks->saveBlock($book, $payload, $userId);
        }

        foreach ($comparison['items'] as $item) {
            if ($item['kind'] === 'removed' && ($selected === null || isset($selected[$item['selection_key']]))) {
                $deleted[] = $item['block_uuid'];
            }
        }
        $blocks->markBlocksDeleted($book, $deleted);

        $comparison['applied_counts'] = collect($comparison['items'])
            ->filter(fn (array $item) => $item['kind'] === 'unchanged' || $selected === null || isset($selected[$item['selection_key']]))
            ->countBy('kind')
            ->map(fn (int $count) => $count)
            ->all() + ['unchanged' => 0, 'modified' => 0, 'added' => 0, 'removed' => 0];

        return $comparison;
    }
}
