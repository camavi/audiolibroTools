<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\BookBlockReview;
use App\Models\BookCategory;
use App\Services\BookBlockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
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

    public function test_dashboard_can_return_default_ai_provider_settings(): void
    {
        $book = $this->createBook();

        $this->getJson("/dashboard/api/ai/providers?service=correction&key_book={$book->key_book}")
            ->assertOk()
            ->assertJsonPath('data.setting.service', 'correction')
            ->assertJsonPath('data.setting.provider_key', 'mock')
            ->assertJsonPath('data.setting.model', 'mock-correction-v1')
            ->assertJsonPath('data.providers.0.provider_key', 'mock')
            ->assertJsonPath('data.services.2.key', 'correction')
            ->assertJsonPath('data.services.7.key', 'versions');
    }

    public function test_dashboard_can_create_custom_ai_provider_and_save_service_setting(): void
    {
        $book = $this->createBook();

        $providerKey = $this->postJson('/dashboard/api/ai/providers', [
            'name' => 'Local Studio',
            'base_url' => 'http://127.0.0.1:9000/v1',
            'models' => ['local-editor', 'local-fast'],
            'default_model' => 'local-editor',
            'api_key' => 'local-secret-key',
        ])
            ->assertCreated()
            ->assertJsonPath('data.provider.name', 'Local Studio')
            ->assertJsonPath('data.provider.base_url', 'http://127.0.0.1:9000/v1')
            ->assertJsonPath('data.provider.has_api_key', true)
            ->json('data.provider.provider_key');

        $this->patchJson('/dashboard/api/ai/settings', [
            'service' => 'correction',
            'key_book' => $book->key_book,
            'provider_key' => $providerKey,
            'model' => 'local-fast',
            'api_key' => 'local-secret-key-updated',
        ])
            ->assertOk()
            ->assertJsonPath('data.setting.service', 'correction')
            ->assertJsonPath('data.setting.provider_key', $providerKey)
            ->assertJsonPath('data.setting.model', 'local-fast');

        $providersPayload = $this->getJson("/dashboard/api/ai/providers?service=correction&key_book={$book->key_book}")
            ->assertOk()
            ->json('data.providers');

        $savedProvider = collect($providersPayload)->firstWhere('provider_key', $providerKey);

        $this->assertTrue($savedProvider['has_api_key']);
        $this->assertArrayNotHasKey('api_key', $savedProvider);

        $this->assertDatabaseHas('ai_providers', [
            'name' => 'Local Studio',
            'default_model' => 'local-editor',
            'is_custom' => true,
        ]);

        $this->assertDatabaseHas('ai_service_settings', [
            'book_id' => $book->id,
            'service' => 'correction',
            'provider_key' => $providerKey,
            'model' => 'local-fast',
        ]);

        $encryptedKey = $this->getConnection()
            ->table('ai_provider_credentials')
            ->where('provider_key', $providerKey)
            ->value('api_key');

        $this->assertNotSame('local-secret-key-updated', $encryptedKey);
        $this->assertSame('local-secret-key-updated', Crypt::decryptString($encryptedKey));
    }

    public function test_dashboard_can_return_editor_block_versions(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::uuid();

        $first = $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('First paragraph.'),
            'text_plain' => 'First paragraph.',
        ]);

        $second = $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'base_version_id' => $first['version']->id,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Second paragraph.'),
            'text_plain' => 'Second paragraph.',
        ]);

        $this->getJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/versions")
            ->assertOk()
            ->assertJsonPath('data.block.block_uuid', $blockUuid)
            ->assertJsonPath('data.block.current_version_id', $second['version']->id)
            ->assertJsonPath('data.versions.0.id', $second['version']->id)
            ->assertJsonPath('data.versions.0.version_number', 2)
            ->assertJsonPath('data.versions.0.is_current', true)
            ->assertJsonPath('data.versions.1.id', $first['version']->id)
            ->assertJsonPath('data.versions.1.version_number', 1)
            ->assertJsonPath('data.versions.1.is_current', false);
    }

    public function test_dashboard_can_return_editor_block_reviews(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::uuid();

        $first = $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Original phrase.'),
            'text_plain' => 'Original phrase.',
        ]);

        $second = $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'base_version_id' => $first['version']->id,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Original phrase updated.'),
            'text_plain' => 'Original phrase updated.',
        ]);

        BookBlockReview::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $second['block']->id,
            'book_block_version_id' => $second['version']->id,
            'type' => 'grammar',
            'status' => 'draft',
            'source' => 'ai',
            'original_text' => 'Original phrase updated.',
            'suggested_text' => 'Updated original phrase.',
            'notes_json' => ['reason' => 'word order'],
        ]);

        BookBlockReview::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $second['block']->id,
            'book_block_version_id' => $first['version']->id,
            'type' => 'style',
            'status' => 'stale',
            'source' => 'ai',
            'original_text' => 'Original phrase.',
            'suggested_text' => 'Initial phrase.',
        ]);

        $this->getJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/reviews")
            ->assertOk()
            ->assertJsonPath('data.block.block_uuid', $blockUuid)
            ->assertJsonPath('data.reviews.0.type', 'style')
            ->assertJsonPath('data.reviews.0.status', 'stale')
            ->assertJsonPath('data.reviews.0.is_current_version', false)
            ->assertJsonPath('data.reviews.1.type', 'grammar')
            ->assertJsonPath('data.reviews.1.status', 'draft')
            ->assertJsonPath('data.reviews.1.source', 'ai')
            ->assertJsonPath('data.reviews.1.version_number', 2)
            ->assertJsonPath('data.reviews.1.is_current_version', true);
    }

    public function test_dashboard_can_create_mock_editor_block_review(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::uuid();

        $saved = $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Original phrase  , with spacing. Next sentence.'),
            'text_plain' => 'Original phrase  , with spacing. Next sentence.',
        ]);

        $this->postJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/reviews", [
            'type' => 'grammar',
            'provider_key' => 'openai',
            'model' => 'gpt-5-mini',
        ])
            ->assertCreated()
            ->assertJsonPath('data.review.type', 'grammar')
            ->assertJsonPath('data.review.status', 'draft')
            ->assertJsonPath('data.review.source', 'mock-ai')
            ->assertJsonPath('data.review.block_version_id', $saved['version']->id)
            ->assertJsonPath('data.review.version_number', 1)
            ->assertJsonPath('data.review.is_current_version', true)
            ->assertJsonPath('data.review.notes_json.provider_key', 'openai')
            ->assertJsonPath('data.review.notes_json.model', 'gpt-5-mini')
            ->assertJsonPath('data.review.original_text', 'Original phrase , with spacing. Next sentence.')
            ->assertJsonPath('data.review.suggested_text', 'Original phrase, with spacing. Next sentence.');

        $this->assertDatabaseHas('book_block_reviews', [
            'book_id' => $book->id,
            'book_block_id' => $saved['block']->id,
            'book_block_version_id' => $saved['version']->id,
            'source' => 'mock-ai',
            'status' => 'draft',
        ]);
    }

    public function test_dashboard_reuses_existing_mock_draft_review_for_same_block_version(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::uuid();

        $saved = $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Paragraph to check.'),
            'text_plain' => 'Paragraph to check.',
        ]);

        $first = $this->postJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/reviews", [
            'type' => 'grammar',
        ])
            ->assertCreated()
            ->assertJsonPath('data.created', true)
            ->json('data.review.id');

        $this->postJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/reviews", [
            'type' => 'grammar',
        ])
            ->assertOk()
            ->assertJsonPath('data.created', false)
            ->assertJsonPath('data.review.id', $first)
            ->assertJsonPath('data.review.block_version_id', $saved['version']->id);

        $this->assertDatabaseCount('book_block_reviews', 1);
    }

    public function test_dashboard_can_reject_editor_block_review(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::uuid();

        $saved = $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Paragraph to reject.'),
            'text_plain' => 'Paragraph to reject.',
        ]);

        $review = BookBlockReview::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $saved['block']->id,
            'book_block_version_id' => $saved['version']->id,
            'type' => 'grammar',
            'status' => 'draft',
            'source' => 'mock-ai',
            'original_text' => 'Paragraph to reject.',
            'suggested_text' => 'Paragraph rejected.',
        ]);

        $this->patchJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/reviews/{$review->id}", [
            'status' => 'rejected',
        ])
            ->assertOk()
            ->assertJsonPath('data.review.id', $review->id)
            ->assertJsonPath('data.review.status', 'rejected')
            ->assertJsonPath('data.review.applied_block_version_id', null);

        $this->assertDatabaseHas('book_block_reviews', [
            'id' => $review->id,
            'status' => 'rejected',
            'applied_book_block_version_id' => null,
        ]);
    }

    public function test_dashboard_can_mark_editor_block_review_applied_to_version(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::uuid();

        $first = $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Original phrase.'),
            'text_plain' => 'Original phrase.',
        ]);

        $second = $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'base_version_id' => $first['version']->id,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Suggested phrase.'),
            'text_plain' => 'Suggested phrase.',
        ]);

        $review = BookBlockReview::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $first['block']->id,
            'book_block_version_id' => $first['version']->id,
            'type' => 'grammar',
            'status' => 'draft',
            'source' => 'mock-ai',
            'original_text' => 'Original phrase.',
            'suggested_text' => 'Suggested phrase.',
        ]);

        $this->patchJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/reviews/{$review->id}", [
            'status' => 'applied',
            'applied_book_block_version_id' => $second['version']->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.review.id', $review->id)
            ->assertJsonPath('data.review.status', 'applied')
            ->assertJsonPath('data.review.applied_block_version_id', $second['version']->id);

        $this->assertDatabaseHas('book_block_reviews', [
            'id' => $review->id,
            'status' => 'applied',
            'applied_book_block_version_id' => $second['version']->id,
        ]);
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
