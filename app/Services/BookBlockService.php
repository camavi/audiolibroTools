<?php

namespace App\Services;

use App\Exceptions\BookBlockVersionConflictException;
use App\Models\Book;
use App\Models\BookBlock;
use App\Models\BookBlockVersion;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class BookBlockService
{
    public function saveBlock(Book $book, array $payload, ?int $userId = null): array
    {
        return DB::transaction(function () use ($book, $payload, $userId) {
            $blockUuid = $payload['block_uuid'] ?? (string) Str::ulid();
            $contentJson = $payload['content_json'] ?? null;
            $textPlain = $payload['text_plain'] ?? $this->extractPlainText($contentJson);
            $contentHash = $this->hashContent($contentJson, $textPlain);

            $block = BookBlock::query()
                ->where('book_id', $book->id)
                ->where('block_uuid', $blockUuid)
                ->lockForUpdate()
                ->first();

            $created = false;

            if (! $block) {
                $created = true;
                $block = BookBlock::query()->create([
                    'book_id' => $book->id,
                    'block_uuid' => $blockUuid,
                    'type' => $payload['type'] ?? 'paragraph',
                    'sort_order' => $payload['sort_order'] ?? 0,
                    'parent_block_id' => $payload['parent_block_id'] ?? null,
                    'content_json' => $contentJson,
                    'text_plain' => $this->normalizeText($textPlain),
                    'content_hash' => $contentHash,
                    'status' => $payload['status'] ?? 'clean',
                ]);
            } else {
                $this->assertBaseVersion($block, $payload['base_version_id'] ?? null);
            }

            if (! $created && $block->content_hash === $contentHash) {
                $block->fill([
                    'type' => $payload['type'] ?? $block->type,
                    'sort_order' => $payload['sort_order'] ?? $block->sort_order,
                    'parent_block_id' => array_key_exists('parent_block_id', $payload)
                        ? $payload['parent_block_id']
                        : $block->parent_block_id,
                    'status' => $payload['status'] ?? $block->status,
                ])->save();

                return [
                    'block' => $block->fresh(['currentVersion']),
                    'version' => $block->currentVersion,
                    'created' => false,
                    'changed' => false,
                ];
            }

            $version = $this->createVersion($block, [
                'source' => $payload['source'] ?? 'manual',
                'content_json' => $contentJson,
                'text_plain' => $this->normalizeText($textPlain),
                'content_hash' => $contentHash,
                'diff_json' => $payload['diff_json'] ?? null,
                'created_by' => $userId,
            ]);

            $block->update([
                'type' => $payload['type'] ?? $block->type,
                'sort_order' => $payload['sort_order'] ?? $block->sort_order,
                'parent_block_id' => array_key_exists('parent_block_id', $payload)
                    ? $payload['parent_block_id']
                    : $block->parent_block_id,
                'content_json' => $contentJson,
                'text_plain' => $this->normalizeText($textPlain),
                'content_hash' => $contentHash,
                'current_version_id' => $version->id,
                'status' => $payload['status'] ?? 'clean',
            ]);

            return [
                'block' => $block->fresh(['currentVersion']),
                'version' => $version,
                'created' => $created,
                'changed' => true,
            ];
        });
    }

    public function markBlocksDeleted(Book $book, array $blockUuids): int
    {
        $blockUuids = array_values(array_filter(array_unique($blockUuids)));

        if (! count($blockUuids)) {
            return 0;
        }

        return BookBlock::query()
            ->where('book_id', $book->id)
            ->whereIn('block_uuid', $blockUuids)
            ->where('status', '!=', 'deleted')
            ->update(['status' => 'deleted']);
    }

    public function normalizeText(?string $text): string
    {
        $text = str_replace(["\r\n", "\r"], "\n", $text ?? '');
        $text = str_replace("\u{00A0}", ' ', $text);
        $text = preg_replace('/[ \t]+/u', ' ', $text) ?? $text;
        $text = preg_replace("/\n{3,}/", "\n\n", $text) ?? $text;

        return trim($text);
    }

    public function hashContent(?array $contentJson, ?string $textPlain): string
    {
        $payload = [
            'content' => $this->canonicalize($contentJson ?? []),
            'text' => $this->normalizeText($textPlain),
        ];

        return hash('sha256', json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    public function extractPlainText(?array $contentJson): string
    {
        if (! $contentJson) {
            return '';
        }

        $parts = [];
        $walk = function (array $node) use (&$walk, &$parts): void {
            if (isset($node['text']) && is_string($node['text'])) {
                $parts[] = $node['text'];
            }

            foreach ($node['content'] ?? [] as $child) {
                if (is_array($child)) {
                    $walk($child);
                }
            }
        };

        $walk($contentJson);

        return $this->normalizeText(implode(' ', $parts));
    }

    private function assertBaseVersion(BookBlock $block, ?int $baseVersionId): void
    {
        if ($baseVersionId === null || $block->current_version_id === null) {
            return;
        }

        if ((int) $block->current_version_id !== $baseVersionId) {
            throw new BookBlockVersionConflictException($baseVersionId, $block->current_version_id, $block->block_uuid);
        }
    }

    private function createVersion(BookBlock $block, array $data): BookBlockVersion
    {
        $nextVersion = ((int) $block->versions()->max('version_number')) + 1;

        return BookBlockVersion::query()->create([
            'book_block_id' => $block->id,
            'version_number' => $nextVersion,
            'source' => $data['source'],
            'content_json' => $data['content_json'],
            'text_plain' => $data['text_plain'],
            'content_hash' => $data['content_hash'],
            'diff_json' => $data['diff_json'],
            'created_by' => $data['created_by'],
        ]);
    }

    private function canonicalize(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }

        $normalized = [];

        foreach ($value as $key => $item) {
            $normalized[$key] = $this->canonicalize($item);
        }

        if (! array_is_list($normalized)) {
            ksort($normalized);
        }

        return $normalized;
    }
}
