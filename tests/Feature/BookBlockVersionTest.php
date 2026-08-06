<?php

namespace Tests\Feature;

use App\Exceptions\BookBlockVersionConflictException;
use App\Models\Book;
use App\Models\BookBlock;
use App\Models\BookBlockVersion;
use App\Services\BookBlockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class BookBlockVersionTest extends TestCase
{
    use RefreshDatabase;

    public function test_service_creates_block_with_initial_version(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);

        $result = $service->saveBlock($book, [
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('First paragraph.'),
            'text_plain' => 'First paragraph.',
            'source' => 'manual',
        ]);

        $block = $result['block'];

        $this->assertTrue($result['created']);
        $this->assertTrue($result['changed']);
        $this->assertSame('First paragraph.', $block->text_plain);
        $this->assertSame(1, $result['version']->version_number);
        $this->assertSame($result['version']->id, $block->current_version_id);
        $this->assertDatabaseCount('book_blocks', 1);
        $this->assertDatabaseCount('book_block_versions', 1);
    }

    public function test_service_creates_new_version_when_content_changes(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);

        $first = $service->saveBlock($book, [
            'block_uuid' => (string) Str::ulid(),
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('First paragraph.'),
            'text_plain' => 'First paragraph.',
        ]);

        $second = $service->saveBlock($book, [
            'block_uuid' => $first['block']->block_uuid,
            'base_version_id' => $first['version']->id,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('First paragraph edited.'),
            'text_plain' => 'First paragraph edited.',
        ]);

        $this->assertFalse($second['created']);
        $this->assertTrue($second['changed']);
        $this->assertSame(2, $second['version']->version_number);
        $this->assertSame('First paragraph edited.', $second['block']->text_plain);
        $this->assertDatabaseCount('book_blocks', 1);
        $this->assertDatabaseCount('book_block_versions', 2);
    }

    public function test_service_does_not_create_version_when_content_hash_is_unchanged(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);

        $first = $service->saveBlock($book, [
            'block_uuid' => (string) Str::ulid(),
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Same paragraph.'),
            'text_plain' => " Same   paragraph.\n",
        ]);

        $second = $service->saveBlock($book, [
            'block_uuid' => $first['block']->block_uuid,
            'base_version_id' => $first['version']->id,
            'type' => 'paragraph',
            'sort_order' => 2000,
            'content_json' => $this->paragraphJson('Same paragraph.'),
            'text_plain' => 'Same paragraph.',
        ]);

        $this->assertFalse($second['created']);
        $this->assertFalse($second['changed']);
        $this->assertSame($first['version']->id, $second['version']->id);
        $this->assertSame(2000, $second['block']->sort_order);
        $this->assertDatabaseCount('book_block_versions', 1);
    }

    public function test_service_rejects_stale_base_version(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);

        $first = $service->saveBlock($book, [
            'block_uuid' => (string) Str::ulid(),
            'content_json' => $this->paragraphJson('First paragraph.'),
            'text_plain' => 'First paragraph.',
        ]);

        $second = $service->saveBlock($book, [
            'block_uuid' => $first['block']->block_uuid,
            'base_version_id' => $first['version']->id,
            'content_json' => $this->paragraphJson('Second paragraph.'),
            'text_plain' => 'Second paragraph.',
        ]);

        $this->expectException(BookBlockVersionConflictException::class);

        $service->saveBlock($book, [
            'block_uuid' => $first['block']->block_uuid,
            'base_version_id' => $first['version']->id,
            'content_json' => $this->paragraphJson('Stale paragraph.'),
            'text_plain' => 'Stale paragraph.',
        ]);

        $this->assertNotNull($second);
    }

    public function test_book_block_can_keep_current_version_and_history(): void
    {
        $book = $this->createBook();

        $block = BookBlock::query()->create([
            'book_id' => $book->id,
            'block_uuid' => (string) Str::ulid(),
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => 'First paragraph.'],
                ],
            ],
            'text_plain' => 'First paragraph.',
            'content_hash' => hash('sha256', 'First paragraph.'),
            'status' => 'clean',
        ]);

        $version = BookBlockVersion::query()->create([
            'book_block_id' => $block->id,
            'version_number' => 1,
            'source' => 'manual',
            'content_json' => $block->content_json,
            'text_plain' => $block->text_plain,
            'content_hash' => $block->content_hash,
        ]);

        $block->update(['current_version_id' => $version->id]);

        $this->assertTrue($book->blocks()->whereKey($block->id)->exists());
        $this->assertSame($version->id, $block->fresh()->currentVersion->id);
        $this->assertSame('First paragraph.', $block->versions()->firstOrFail()->text_plain);
    }

    private function createBook(): Book
    {
        return Book::query()->create([
            'key_book' => md5('book-block-version-test'.Str::random(8)),
            'id_file' => 0,
            'name' => 'Tracked Book',
            'description' => '',
            'categories' => [],
        ]);
    }

    private function paragraphJson(string $text): array
    {
        return [
            'type' => 'paragraph',
            'content' => [
                ['type' => 'text', 'text' => $text],
            ],
        ];
    }
}
