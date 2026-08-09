<?php

namespace Tests\Feature;

use App\Models\AiChatMessage;
use App\Models\AiChatThread;
use App\Models\Book;
use App\Models\BookBlockComment;
use App\Models\BookBlockReview;
use App\Models\BookBlockTranslation;
use App\Models\BookCategory;
use App\Models\BookVoiceProfile;
use App\Services\BookBlockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
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
            ->assertJsonPath('data.setting.system_prompt', 'You are a professional book editor. Return only the corrected text, with no explanation.')
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
            'system_prompt' => 'Correct this novel with a dry, concise style.',
        ])
            ->assertOk()
            ->assertJsonPath('data.setting.service', 'correction')
            ->assertJsonPath('data.setting.provider_key', $providerKey)
            ->assertJsonPath('data.setting.model', 'local-fast')
            ->assertJsonPath('data.setting.system_prompt', 'Correct this novel with a dry, concise style.');

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
        $optionsJson = $this->getConnection()
            ->table('ai_service_settings')
            ->where('book_id', $book->id)
            ->where('service', 'correction')
            ->value('options_json');

        $this->assertSame(
            'Correct this novel with a dry, concise style.',
            json_decode($optionsJson, true)['system_prompt'] ?? null
        );

        $encryptedKey = $this->getConnection()
            ->table('ai_provider_credentials')
            ->where('provider_key', $providerKey)
            ->value('api_key');

        $this->assertNotSame('local-secret-key-updated', $encryptedKey);
        $this->assertSame('local-secret-key-updated', Crypt::decryptString($encryptedKey));
    }

    public function test_dashboard_can_ask_mock_ai_chat_about_selected_block(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::uuid();

        $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('A quiet forest paragraph for chat.'),
            'text_plain' => 'A quiet forest paragraph for chat.',
        ]);

        $this->postJson("/dashboard/api/books/{$book->key_book}/ai/chat", [
            'scope' => 'block',
            'block_uuid' => $blockUuid,
            'message' => 'What is the mood?',
            'provider_key' => 'mock',
            'model' => 'mock-correction-v1',
        ])
            ->assertOk()
            ->assertJsonPath('data.message.source', 'mock-ai')
            ->assertJsonPath('data.message.provider_key', 'mock')
            ->assertJsonPath('data.message.model', 'mock-correction-v1')
            ->assertJsonPath('data.message.metadata.message', 'What is the mood?')
            ->assertJsonPath('data.message.metadata.context_preview', 'A quiet forest paragraph for chat.')
            ->assertJsonPath('data.messages.0.question', 'What is the mood?');

        $this->assertDatabaseCount('ai_chat_threads', 1);
        $this->assertDatabaseCount('ai_chat_messages', 2);

        $thread = AiChatThread::query()->firstOrFail();
        $this->assertSame($book->id, $thread->book_id);
        $this->assertSame('block', $thread->scope);
        $this->assertSame($blockUuid, $thread->block_uuid);

        $this->assertSame(['user', 'assistant'], AiChatMessage::query()->orderBy('id')->pluck('role')->all());

        $this->getJson("/dashboard/api/books/{$book->key_book}/ai/chat?scope=block&block_uuid={$blockUuid}")
            ->assertOk()
            ->assertJsonPath('data.thread.id', $thread->id)
            ->assertJsonPath('data.messages.0.question', 'What is the mood?')
            ->assertJsonPath('data.messages.0.provider_key', 'mock');
    }

    public function test_dashboard_can_ask_openai_ai_chat_about_selected_block(): void
    {
        Http::fake([
            'https://api.openai.com/v1/responses' => Http::response([
                'id' => 'resp_chat_123',
                'output_text' => 'The paragraph has a quiet, reflective mood.',
            ]),
        ]);

        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::uuid();

        $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('A quiet forest paragraph for chat.'),
            'text_plain' => 'A quiet forest paragraph for chat.',
        ]);

        $this->patchJson('/dashboard/api/ai/settings', [
            'service' => 'chat',
            'key_book' => $book->key_book,
            'provider_key' => 'openai',
            'model' => 'gpt-5-mini',
            'api_key' => 'sk-chat-openai',
            'system_prompt' => 'Answer as a concise literary editor.',
        ])->assertOk();

        $this->postJson("/dashboard/api/books/{$book->key_book}/ai/chat", [
            'scope' => 'block',
            'block_uuid' => $blockUuid,
            'message' => 'What is the mood?',
            'provider_key' => 'openai',
            'model' => 'gpt-5-mini',
        ])
            ->assertOk()
            ->assertJsonPath('data.message.source', 'ai')
            ->assertJsonPath('data.message.answer', 'The paragraph has a quiet, reflective mood.')
            ->assertJsonPath('data.message.provider_key', 'openai')
            ->assertJsonPath('data.message.model', 'gpt-5-mini')
            ->assertJsonPath('data.message.metadata.response_id', 'resp_chat_123')
            ->assertJsonPath('data.messages.0.answer', 'The paragraph has a quiet, reflective mood.');

        Http::assertSent(fn ($request) => $request->url() === 'https://api.openai.com/v1/responses'
            && $request->hasHeader('Authorization', 'Bearer sk-chat-openai')
            && $request['model'] === 'gpt-5-mini'
            && $request['store'] === false
            && $request['input'][0]['content'][0]['text'] === 'Answer as a concise literary editor.'
            && str_contains($request['input'][1]['content'][0]['text'], 'A quiet forest paragraph for chat.')
            && str_contains($request['input'][1]['content'][0]['text'], 'What is the mood?'));
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

        BookBlockComment::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $first['block']->id,
            'book_block_version_id' => $first['version']->id,
            'block_uuid' => $blockUuid,
            'status' => 'open',
            'body' => 'Older note.',
        ]);

        BookBlockReview::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $second['block']->id,
            'book_block_version_id' => $second['version']->id,
            'type' => 'grammar',
            'status' => 'draft',
            'source' => 'mock-ai',
            'original_text' => 'Second paragraph.',
            'suggested_text' => 'Second paragraph improved.',
        ]);

        $profile = BookVoiceProfile::query()->create([
            'book_id' => $book->id,
            'name' => 'Narrator',
            'role' => 'narrator',
            'voice_id' => 'narrator-main',
        ]);

        $this->patchJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/voice-assignment", [
            'voice_profile_id' => $profile->id,
        ])->assertOk();

        $this->postJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/audio/generate", [
            'provider_key' => 'mock',
            'model' => 'mock-tts-v1',
        ])->assertCreated();

        $this->postJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/translations", [
            'target_locale' => 'fr',
            'provider_key' => 'mock',
            'model' => 'mock-translation-v1',
        ])->assertCreated();

        $this->getJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/versions")
            ->assertOk()
            ->assertJsonPath('data.block.block_uuid', $blockUuid)
            ->assertJsonPath('data.block.current_version_id', $second['version']->id)
            ->assertJsonPath('data.versions.0.id', $second['version']->id)
            ->assertJsonPath('data.versions.0.version_number', 2)
            ->assertJsonPath('data.versions.0.is_current', true)
            ->assertJsonPath('data.versions.0.activity.reviews', 1)
            ->assertJsonPath('data.versions.0.activity.voices', 1)
            ->assertJsonPath('data.versions.0.activity.audio', 1)
            ->assertJsonPath('data.versions.0.activity.translations', 1)
            ->assertJsonPath('data.versions.0.has_stale_activity', false)
            ->assertJsonPath('data.versions.1.id', $first['version']->id)
            ->assertJsonPath('data.versions.1.version_number', 1)
            ->assertJsonPath('data.versions.1.is_current', false)
            ->assertJsonPath('data.versions.1.activity.comments', 1)
            ->assertJsonPath('data.versions.1.has_activity', true)
            ->assertJsonPath('data.versions.1.has_stale_activity', true);
    }

    public function test_dashboard_can_restore_editor_block_version(): void
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

        $this->postJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/versions/restore", [
            'version_id' => $first['version']->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.block.block_uuid', $blockUuid)
            ->assertJsonPath('data.block.text_plain', 'First paragraph.')
            ->assertJsonPath('data.version.version_number', 3)
            ->assertJsonPath('data.version.source', 'restore')
            ->assertJsonPath('data.restored_from.id', $first['version']->id)
            ->assertJsonPath('data.changed', true);

        $this->assertDatabaseHas('book_blocks', [
            'id' => $first['block']->id,
            'text_plain' => 'First paragraph.',
        ]);

        $this->assertDatabaseHas('book_block_versions', [
            'book_block_id' => $first['block']->id,
            'version_number' => 3,
            'source' => 'restore',
            'text_plain' => 'First paragraph.',
        ]);

        $this->assertDatabaseMissing('book_blocks', [
            'id' => $second['block']->id,
            'current_version_id' => $second['version']->id,
        ]);
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
            'provider_key' => 'mock',
            'model' => 'mock-correction-v1',
        ])
            ->assertCreated()
            ->assertJsonPath('data.review.type', 'grammar')
            ->assertJsonPath('data.review.status', 'draft')
            ->assertJsonPath('data.review.source', 'mock-ai')
            ->assertJsonPath('data.review.block_version_id', $saved['version']->id)
            ->assertJsonPath('data.review.version_number', 1)
            ->assertJsonPath('data.review.is_current_version', true)
            ->assertJsonPath('data.review.notes_json.provider_key', 'mock')
            ->assertJsonPath('data.review.notes_json.model', 'mock-correction-v1')
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

    public function test_dashboard_can_create_openai_editor_block_review(): void
    {
        Http::fake([
            'https://api.openai.com/v1/responses' => Http::response([
                'id' => 'resp_test_123',
                'output_text' => 'Corrected paragraph from provider.',
            ]),
        ]);

        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::uuid();

        $saved = $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Original provider paragraph.'),
            'text_plain' => 'Original provider paragraph.',
        ]);

        $this->patchJson('/dashboard/api/ai/settings', [
            'service' => 'correction',
            'key_book' => $book->key_book,
            'provider_key' => 'openai',
            'model' => 'gpt-5-mini',
            'api_key' => 'sk-test-openai',
            'system_prompt' => 'Correct like a careful Italian book editor.',
        ])->assertOk();

        $this->postJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/reviews", [
            'type' => 'grammar',
            'provider_key' => 'openai',
            'model' => 'gpt-5-mini',
        ])
            ->assertCreated()
            ->assertJsonPath('data.review.source', 'ai')
            ->assertJsonPath('data.review.block_version_id', $saved['version']->id)
            ->assertJsonPath('data.review.original_text', 'Original provider paragraph.')
            ->assertJsonPath('data.review.suggested_text', 'Corrected paragraph from provider.')
            ->assertJsonPath('data.review.notes_json.provider_key', 'openai')
            ->assertJsonPath('data.review.notes_json.model', 'gpt-5-mini')
            ->assertJsonPath('data.review.notes_json.response_id', 'resp_test_123');

        Http::assertSent(fn ($request) => $request->url() === 'https://api.openai.com/v1/responses'
            && $request->hasHeader('Authorization', 'Bearer sk-test-openai')
            && $request['model'] === 'gpt-5-mini'
            && $request['store'] === false
            && $request['input'][0]['content'][0]['text'] === 'Correct like a careful Italian book editor.');
    }

    public function test_dashboard_requires_api_key_for_openai_editor_block_review(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::uuid();

        $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Original provider paragraph.'),
            'text_plain' => 'Original provider paragraph.',
        ]);

        $response = $this->postJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/reviews", [
            'type' => 'grammar',
            'provider_key' => 'openai',
            'model' => 'gpt-5-mini',
        ]);

        $this->assertSame(422, $response->getStatusCode(), $response->getContent());
        $payload = json_decode($response->getContent(), true);
        $this->assertSame('Save an API key before using OpenAI corrections.', $payload['errors']['api_key'][0] ?? null);
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

    public function test_dashboard_can_create_and_return_block_comments(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::uuid();

        $saved = $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Paragraph with a note.'),
            'text_plain' => 'Paragraph with a note.',
        ]);

        $this->postJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/comments", [
            'body' => 'Check this sentence rhythm.',
        ])
            ->assertCreated()
            ->assertJsonPath('data.comment.status', 'open')
            ->assertJsonPath('data.comment.body', 'Check this sentence rhythm.')
            ->assertJsonPath('data.comment.block_uuid', $blockUuid)
            ->assertJsonPath('data.comment.block_version_id', $saved['version']->id)
            ->assertJsonPath('data.comment.version_number', 1)
            ->assertJsonPath('data.comment.is_current_version', true);

        $this->assertDatabaseHas('book_block_comments', [
            'book_id' => $book->id,
            'book_block_id' => $saved['block']->id,
            'book_block_version_id' => $saved['version']->id,
            'status' => 'open',
            'body' => 'Check this sentence rhythm.',
        ]);

        $this->getJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/comments")
            ->assertOk()
            ->assertJsonPath('data.block.block_uuid', $blockUuid)
            ->assertJsonPath('data.comments.0.body', 'Check this sentence rhythm.')
            ->assertJsonPath('data.comments.0.status', 'open');
    }

    public function test_dashboard_can_resolve_and_reopen_block_comment(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::uuid();

        $saved = $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Paragraph to comment.'),
            'text_plain' => 'Paragraph to comment.',
        ]);

        $comment = BookBlockComment::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $saved['block']->id,
            'book_block_version_id' => $saved['version']->id,
            'block_uuid' => $blockUuid,
            'status' => 'open',
            'body' => 'Resolve this note.',
        ]);

        $this->patchJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/comments/{$comment->id}", [
            'status' => 'resolved',
        ])
            ->assertOk()
            ->assertJsonPath('data.comment.id', $comment->id)
            ->assertJsonPath('data.comment.status', 'resolved');

        $this->assertDatabaseHas('book_block_comments', [
            'id' => $comment->id,
            'status' => 'resolved',
        ]);
        $this->assertNotNull($comment->refresh()->resolved_at);

        $this->patchJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/comments/{$comment->id}", [
            'status' => 'open',
        ])
            ->assertOk()
            ->assertJsonPath('data.comment.status', 'open')
            ->assertJsonPath('data.comment.resolved_at', null);
    }

    public function test_dashboard_can_create_and_return_book_voice_profiles(): void
    {
        $book = $this->createBook();

        $this->postJson("/dashboard/api/books/{$book->key_book}/voices", [
            'name' => 'Elara',
            'role' => 'character',
            'voice_provider' => 'local',
            'voice_id' => 'voice-elara',
            'language' => 'it',
            'notes' => 'Young, curious and warm.',
        ])
            ->assertCreated()
            ->assertJsonPath('data.profile.name', 'Elara')
            ->assertJsonPath('data.profile.role', 'character')
            ->assertJsonPath('data.profile.voice_provider', 'local')
            ->assertJsonPath('data.profile.voice_id', 'voice-elara')
            ->assertJsonPath('data.profile.language', 'it')
            ->assertJsonPath('data.profile.notes', 'Young, curious and warm.');

        $this->assertDatabaseHas('book_voice_profiles', [
            'book_id' => $book->id,
            'name' => 'Elara',
            'role' => 'character',
            'voice_provider' => 'local',
            'voice_id' => 'voice-elara',
        ]);

        $this->getJson("/dashboard/api/books/{$book->key_book}/voices")
            ->assertOk()
            ->assertJsonPath('data.profiles.0.name', 'Elara')
            ->assertJsonPath('data.profiles.0.role', 'character');
    }

    public function test_dashboard_can_assign_and_clear_voice_for_current_block_version(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::uuid();

        $saved = $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Paragraph to narrate.'),
            'text_plain' => 'Paragraph to narrate.',
        ]);

        $profile = BookVoiceProfile::query()->create([
            'book_id' => $book->id,
            'name' => 'Narrator',
            'role' => 'narrator',
            'voice_provider' => 'local',
            'voice_id' => 'narrator-main',
        ]);

        $this->patchJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/voice-assignment", [
            'voice_profile_id' => $profile->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.assignment.voice_profile_id', $profile->id)
            ->assertJsonPath('data.assignment.voice_profile.name', 'Narrator')
            ->assertJsonPath('data.assignment.block_version_id', $saved['version']->id)
            ->assertJsonPath('data.assignment.version_number', 1)
            ->assertJsonPath('data.assignment.is_current_version', true);

        $this->assertDatabaseHas('book_block_voice_assignments', [
            'book_id' => $book->id,
            'book_block_id' => $saved['block']->id,
            'book_block_version_id' => $saved['version']->id,
            'book_voice_profile_id' => $profile->id,
            'block_uuid' => $blockUuid,
        ]);

        $this->getJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/voice-assignment")
            ->assertOk()
            ->assertJsonPath('data.assignment.voice_profile.name', 'Narrator');

        $this->patchJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/voice-assignment", [
            'voice_profile_id' => null,
        ])
            ->assertOk()
            ->assertJsonPath('data.assignment', null)
            ->assertJsonPath('data.cleared', true);

        $this->assertDatabaseMissing('book_block_voice_assignments', [
            'book_id' => $book->id,
            'book_block_id' => $saved['block']->id,
            'book_block_version_id' => $saved['version']->id,
        ]);
    }

    public function test_dashboard_cannot_assign_voice_from_another_book(): void
    {
        $book = $this->createBook();
        $otherBook = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::uuid();

        $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Paragraph to narrate.'),
            'text_plain' => 'Paragraph to narrate.',
        ]);

        $otherProfile = BookVoiceProfile::query()->create([
            'book_id' => $otherBook->id,
            'name' => 'Other narrator',
            'role' => 'narrator',
        ]);

        $this->patchJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/voice-assignment", [
            'voice_profile_id' => $otherProfile->id,
        ])->assertNotFound();

        $this->assertDatabaseCount('book_block_voice_assignments', 0);
    }

    public function test_dashboard_can_generate_mock_audio_for_assigned_block(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::uuid();

        $saved = $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Paragraph for generated audio.'),
            'text_plain' => 'Paragraph for generated audio.',
        ]);

        $profile = BookVoiceProfile::query()->create([
            'book_id' => $book->id,
            'name' => 'Narrator',
            'role' => 'narrator',
            'voice_provider' => 'local',
            'voice_id' => 'narrator-main',
        ]);

        $this->patchJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/voice-assignment", [
            'voice_profile_id' => $profile->id,
        ])->assertOk();

        $this->postJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/audio/generate", [
            'provider_key' => 'mock',
            'model' => 'mock-tts-v1',
        ])
            ->assertCreated()
            ->assertJsonPath('data.job.status', 'completed')
            ->assertJsonPath('data.segment.status', 'completed')
            ->assertJsonPath('data.segment.provider_key', 'mock')
            ->assertJsonPath('data.segment.model', 'mock-tts-v1')
            ->assertJsonPath('data.segment.voice_profile.name', 'Narrator')
            ->assertJsonPath('data.segment.voice_id', 'narrator-main')
            ->assertJsonPath('data.segment.block_version_id', $saved['version']->id)
            ->assertJsonPath('data.segment.version_number', 1)
            ->assertJsonPath('data.segment.is_current_version', true)
            ->assertJsonPath('data.segment.text_plain', 'Paragraph for generated audio.');

        $this->assertDatabaseHas('book_audio_jobs', [
            'book_id' => $book->id,
            'book_block_id' => $saved['block']->id,
            'book_block_version_id' => $saved['version']->id,
            'book_voice_profile_id' => $profile->id,
            'status' => 'completed',
            'provider_key' => 'mock',
            'model' => 'mock-tts-v1',
        ]);

        $this->assertDatabaseHas('book_audio_segments', [
            'book_id' => $book->id,
            'book_block_id' => $saved['block']->id,
            'book_block_version_id' => $saved['version']->id,
            'book_voice_profile_id' => $profile->id,
            'status' => 'completed',
            'voice_id' => 'narrator-main',
            'text_plain' => 'Paragraph for generated audio.',
        ]);

        $this->getJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/audio")
            ->assertOk()
            ->assertJsonPath('data.assignment.voice_profile.name', 'Narrator')
            ->assertJsonPath('data.segments.0.voice_profile.name', 'Narrator')
            ->assertJsonPath('data.segments.0.status', 'completed');
    }

    public function test_dashboard_requires_voice_assignment_before_audio_generation(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::uuid();

        $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Paragraph without voice.'),
            'text_plain' => 'Paragraph without voice.',
        ]);

        $this->postJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/audio/generate", [
            'provider_key' => 'mock',
            'model' => 'mock-tts-v1',
        ])
            ->assertStatus(422)
            ->assertJsonPath('errors.voice.0', 'Assign a voice before generating audio.');
    }

    public function test_dashboard_can_create_and_return_block_translation(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::uuid();

        $saved = $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Paragraph to translate.'),
            'text_plain' => 'Paragraph to translate.',
        ]);

        $translationId = $this->postJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/translations", [
            'target_locale' => 'fr',
            'provider_key' => 'mock',
            'model' => 'mock-translation-v1',
        ])
            ->assertCreated()
            ->assertJsonPath('data.translation.status', 'draft')
            ->assertJsonPath('data.translation.target_locale', 'fr')
            ->assertJsonPath('data.translation.provider_key', 'mock')
            ->assertJsonPath('data.translation.model', 'mock-translation-v1')
            ->assertJsonPath('data.translation.source_text', 'Paragraph to translate.')
            ->assertJsonPath('data.translation.translated_text', '[fr] Paragraph to translate.')
            ->assertJsonPath('data.translation.source_block_version_id', $saved['version']->id)
            ->assertJsonPath('data.translation.version_number', 1)
            ->assertJsonPath('data.translation.is_current_version', true)
            ->json('data.translation.id');

        $this->assertDatabaseHas('book_block_translations', [
            'book_id' => $book->id,
            'book_block_id' => $saved['block']->id,
            'source_book_block_version_id' => $saved['version']->id,
            'target_locale' => 'fr',
            'status' => 'draft',
        ]);

        $this->postJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/translations", [
            'target_locale' => 'fr',
            'provider_key' => 'mock',
            'model' => 'mock-translation-v1',
        ])
            ->assertOk()
            ->assertJsonPath('data.created', false)
            ->assertJsonPath('data.translation.id', $translationId);

        $this->assertDatabaseCount('book_block_translations', 1);

        $this->getJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/translations")
            ->assertOk()
            ->assertJsonPath('data.block.block_uuid', $blockUuid)
            ->assertJsonPath('data.translations.0.id', $translationId)
            ->assertJsonPath('data.translations.0.target_locale', 'fr');
    }

    public function test_dashboard_can_approve_and_reject_block_translation(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::uuid();

        $saved = $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Paragraph to approve.'),
            'text_plain' => 'Paragraph to approve.',
        ]);

        $translation = BookBlockTranslation::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $saved['block']->id,
            'source_book_block_version_id' => $saved['version']->id,
            'block_uuid' => $blockUuid,
            'target_locale' => 'es',
            'status' => 'draft',
            'provider_key' => 'mock',
            'model' => 'mock-translation-v1',
            'source' => 'mock',
            'source_text' => 'Paragraph to approve.',
            'translated_text' => '[es] Paragraph to approve.',
        ]);

        $this->patchJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/translations/{$translation->id}", [
            'status' => 'approved',
        ])
            ->assertOk()
            ->assertJsonPath('data.translation.status', 'approved');

        $this->assertDatabaseHas('book_block_translations', [
            'id' => $translation->id,
            'status' => 'approved',
        ]);
        $this->assertNotNull($translation->refresh()->approved_at);

        $this->patchJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/translations/{$translation->id}", [
            'status' => 'rejected',
        ])
            ->assertOk()
            ->assertJsonPath('data.translation.status', 'rejected')
            ->assertJsonPath('data.translation.approved_at', null);
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
