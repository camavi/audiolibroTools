<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\BookCategory;
use App\Services\BookBlockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class DashboardBookTest extends TestCase
{
    use RefreshDatabase;

    public function test_dashboard_book_categories_are_returned(): void
    {
        BookCategory::query()->create([
            'name' => 'Fiction',
            'slug' => 'fiction',
        ]);

        $this->getJson('/dashboard/api/book-categories')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Fiction');
    }

    public function test_dashboard_can_create_blank_book(): void
    {
        Storage::fake('local');

        $category = BookCategory::query()->create([
            'name' => 'Fiction',
            'slug' => 'fiction',
        ]);

        $response = $this->postJson('/dashboard/api/books', [
            'title' => 'My First Book',
            'description' => 'Draft description',
            'categories' => [$category->id],
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.name', 'My First Book');

        $book = Book::query()->firstOrFail();

        $this->assertSame('My First Book', $book->name);
        $this->assertSame('Draft description', $book->description);
        $this->assertSame([$category->id], $book->categories);

        Storage::disk('local')->assertExists("bookEdit/guest/{$book->key_book}.json");
    }

    public function test_dashboard_editor_returns_book_document_and_blocks(): void
    {
        $book = $this->createBook();
        $blockUuid = (string) Str::ulid();
        app(BookBlockService::class)->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Editor paragraph.'),
            'text_plain' => 'Editor paragraph.',
        ]);

        $this->getJson("/dashboard/api/books/{$book->key_book}/editor")
            ->assertOk()
            ->assertJsonPath('data.book.key_book', $book->key_book)
            ->assertJsonPath('data.document.type', 'doc')
            ->assertJsonPath('data.document.content.0.type', 'paragraph')
            ->assertJsonPath('data.document.content.0.attrs.blockId', $blockUuid)
            ->assertJsonPath('data.blocks.0.text_plain', 'Editor paragraph.')
            ->assertJsonPath('data.blocks.0.content_json.attrs.blockId', $blockUuid);
    }

    public function test_dashboard_can_save_editor_blocks_batch(): void
    {
        $book = $this->createBook();
        $blockUuid = (string) Str::uuid();

        $response = $this->patchJson("/dashboard/api/books/{$book->key_book}/blocks", [
            'source' => 'manual',
            'blocks' => [
                [
                    'block_uuid' => $blockUuid,
                    'type' => 'paragraph',
                    'sort_order' => 1000,
                    'content_json' => $this->paragraphJson('Saved paragraph.'),
                    'text_plain' => 'Saved paragraph.',
                ],
            ],
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.blocks.0.block_uuid', $blockUuid)
            ->assertJsonPath('data.blocks.0.created', true)
            ->assertJsonPath('data.blocks.0.changed', true);

        $this->assertDatabaseHas('book_blocks', [
            'book_id' => $book->id,
            'block_uuid' => $blockUuid,
            'text_plain' => 'Saved paragraph.',
        ]);

        $this->assertDatabaseCount('book_block_versions', 1);
    }

    public function test_dashboard_editor_block_save_returns_conflict_for_stale_version(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::ulid();

        $first = $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('First paragraph.'),
            'text_plain' => 'First paragraph.',
        ]);

        $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'base_version_id' => $first['version']->id,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Second paragraph.'),
            'text_plain' => 'Second paragraph.',
        ]);

        $this->patchJson("/dashboard/api/books/{$book->key_book}/blocks", [
            'blocks' => [
                [
                    'block_uuid' => $blockUuid,
                    'base_version_id' => $first['version']->id,
                    'type' => 'paragraph',
                    'sort_order' => 1000,
                    'content_json' => $this->paragraphJson('Stale paragraph.'),
                    'text_plain' => 'Stale paragraph.',
                ],
            ],
        ])
            ->assertStatus(409)
            ->assertJsonPath('conflict.block_uuid', $blockUuid);
    }

    public function test_dashboard_rejects_duplicate_block_uuid_in_same_save_request(): void
    {
        $book = $this->createBook();
        $blockUuid = (string) Str::uuid();

        $this->patchJson("/dashboard/api/books/{$book->key_book}/blocks", [
            'blocks' => [
                [
                    'block_uuid' => $blockUuid,
                    'type' => 'paragraph',
                    'sort_order' => 1000,
                    'content_json' => $this->paragraphJson('First paragraph.'),
                    'text_plain' => 'First paragraph.',
                ],
                [
                    'block_uuid' => $blockUuid,
                    'type' => 'paragraph',
                    'sort_order' => 2000,
                    'content_json' => $this->paragraphJson('Second paragraph.'),
                    'text_plain' => 'Second paragraph.',
                ],
            ],
        ])->assertUnprocessable();

        $this->assertDatabaseMissing('book_blocks', [
            'book_id' => $book->id,
            'block_uuid' => $blockUuid,
        ]);
    }

    public function test_dashboard_can_mark_editor_blocks_deleted(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $keepUuid = (string) Str::uuid();
        $deleteUuid = (string) Str::uuid();

        $service->saveBlock($book, [
            'block_uuid' => $keepUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Keep paragraph.'),
            'text_plain' => 'Keep paragraph.',
        ]);

        $service->saveBlock($book, [
            'block_uuid' => $deleteUuid,
            'type' => 'paragraph',
            'sort_order' => 2000,
            'content_json' => $this->paragraphJson('Delete paragraph.'),
            'text_plain' => 'Delete paragraph.',
        ]);

        $this->patchJson("/dashboard/api/books/{$book->key_book}/blocks", [
            'blocks' => [],
            'deleted_block_uuids' => [$deleteUuid],
        ])
            ->assertOk()
            ->assertJsonPath('data.deleted_count', 1)
            ->assertJsonPath('data.deleted_block_uuids.0', $deleteUuid);

        $this->assertDatabaseHas('book_blocks', [
            'book_id' => $book->id,
            'block_uuid' => $deleteUuid,
            'status' => 'deleted',
        ]);

        $response = $this->getJson("/dashboard/api/books/{$book->key_book}/editor")
            ->assertOk()
            ->assertJsonPath('data.blocks.0.block_uuid', $keepUuid);

        $this->assertCount(1, $response->json('data.blocks'));
    }

    public function test_dashboard_can_reorder_editor_blocks_without_new_version(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);

        $first = $service->saveBlock($book, [
            'block_uuid' => (string) Str::uuid(),
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('First paragraph.'),
            'text_plain' => 'First paragraph.',
        ]);

        $this->patchJson("/dashboard/api/books/{$book->key_book}/blocks", [
            'blocks' => [
                [
                    'block_uuid' => $first['block']->block_uuid,
                    'base_version_id' => $first['version']->id,
                    'type' => 'paragraph',
                    'sort_order' => 3000,
                    'content_json' => $this->paragraphJson('First paragraph.'),
                    'text_plain' => 'First paragraph.',
                ],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('data.blocks.0.changed', false);

        $this->assertDatabaseHas('book_blocks', [
            'block_uuid' => $first['block']->block_uuid,
            'sort_order' => 3000,
        ]);

        $this->assertDatabaseCount('book_block_versions', 1);
    }

    private function createBook(): Book
    {
        return Book::query()->create([
            'key_book' => md5('dashboard-editor-test'.Str::random(8)),
            'id_file' => 0,
            'name' => 'Editor Book',
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
