<?php

namespace Tests\Feature;

use App\Jobs\ProcessBookAudioJob;
use App\Jobs\ProcessBookTranslationJob;
use App\Models\AccountCreditBalance;
use App\Models\AiChatMessage;
use App\Models\AiChatThread;
use App\Models\AudioMediaAsset;
use App\Models\Book;
use App\Models\BookAudioJob;
use App\Models\BookAudioSegment;
use App\Models\BookAudioTimelineItem;
use App\Models\BookBlockComment;
use App\Models\BookBlockReview;
use App\Models\BookBlockTranslation;
use App\Models\BookBlockVoiceAssignment;
use App\Models\BookCategory;
use App\Models\BookDesignAsset;
use App\Models\BookDistributionConnection;
use App\Models\BookEdition;
use App\Models\BookTranslationJob;
use App\Models\BookVoiceProfile;
use App\Models\User;
use App\Services\Ai\EditorAiTranslationService;
use App\Services\BookAudioGenerationService;
use App\Services\BookBlockService;
use App\Services\Credits\TranslationCreditService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class DashboardBookTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->actingAs($this->user);
    }

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

    public function test_dashboard_can_store_and_list_account_music_media(): void
    {
        Storage::fake('public');

        $this->post('/dashboard/api/audio-media', [
            'kind' => 'music',
            'duration_ms' => 8_500,
            'file' => UploadedFile::fake()->create('forest-ambience.mp3', 120, 'audio/mpeg'),
        ])
            ->assertCreated()
            ->assertJsonPath('data.asset.kind', 'music')
            ->assertJsonPath('data.asset.name', 'forest-ambience');

        $asset = AudioMediaAsset::query()->sole();
        $this->assertSame($this->user->id, $asset->account_id);
        Storage::disk('public')->assertExists($asset->audio_path);

        $this->getJson('/dashboard/api/audio-media?kind=music')
            ->assertOk()
            ->assertJsonPath('data.assets.0.id', $asset->id)
            ->assertJsonPath('data.assets.0.original_name', 'forest-ambience.mp3');
    }

    public function test_dashboard_can_manage_book_cover_design_assets(): void
    {
        Storage::fake('public');
        $book = $this->createBook();

        $this->post("/dashboard/api/books/{$book->key_book}/design-assets", [
            'image' => UploadedFile::fake()->image('cover.png', 1200, 1800),
            'name' => 'First cover',
        ])
            ->assertCreated()
            ->assertJsonPath('data.asset.name', 'First cover')
            ->assertJsonPath('data.asset.width', 1200)
            ->assertJsonPath('data.asset.height', 1800);

        $asset = BookDesignAsset::query()->sole();
        Storage::disk('public')->assertExists($asset->image_path);

        $this->postJson("/dashboard/api/books/{$book->key_book}/design-assets/{$asset->id}/use-cover")
            ->assertOk()
            ->assertJsonPath('data.asset.id', $asset->id);
        $this->assertDatabaseHas('books', ['id' => $book->id, 'cover_img' => Storage::disk('public')->url($asset->image_path)]);

        $this->patchJson("/dashboard/api/books/{$book->key_book}/cover-spec", [
            'format' => 'a6', 'width_mm' => 105, 'height_mm' => 148,
        ])
            ->assertOk()
            ->assertJsonPath('data.cover.format', 'a6');

        $this->getJson("/dashboard/api/books/{$book->key_book}/design-assets")
            ->assertOk()
            ->assertJsonPath('data.assets.0.id', $asset->id);
    }

    public function test_dashboard_can_generate_and_store_a_book_cover_image(): void
    {
        Storage::fake('public');
        config()->set('ai_providers.defaults.1.managed_api_key', 'at-server-openai-key');
        $book = $this->createBook();
        $source = UploadedFile::fake()->image('generated.png', 1024, 1536);
        Http::fake([
            'https://api.openai.com/v1/images/generations' => Http::response([
                'data' => [['b64_json' => base64_encode(file_get_contents($source->getPathname()))]],
            ]),
        ]);

        $this->postJson("/dashboard/api/books/{$book->key_book}/design-assets/generate", [
            'prompt' => 'A misty Italian hillside at dusk, painted in a deep blue and gold palette.',
        ])
            ->assertCreated()
            ->assertJsonPath('data.asset.width', 1024)
            ->assertJsonPath('data.asset.height', 1536);

        $asset = BookDesignAsset::query()->sole();
        $this->assertSame('openai', $asset->metadata_json['source']);
        Storage::disk('public')->assertExists($asset->image_path);
        Http::assertSent(fn ($request) => $request->url() === 'https://api.openai.com/v1/images/generations'
            && $request->hasHeader('Authorization', 'Bearer at-server-openai-key')
            && $request['model'] === 'gpt-image-1'
            && $request['size'] === '1024x1536');
    }

    public function test_dashboard_can_save_and_generate_a_professional_epub(): void
    {
        Storage::fake('public');
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $service->saveBlock($book, ['block_uuid' => (string) Str::uuid(), 'type' => 'heading', 'sort_order' => 1000, 'content_json' => $this->paragraphJson('Chapter one'), 'text_plain' => 'Chapter one']);
        $service->saveBlock($book, ['block_uuid' => (string) Str::uuid(), 'type' => 'paragraph', 'sort_order' => 2000, 'content_json' => $this->paragraphJson('A paragraph ready for an e-reader.'), 'text_plain' => 'A paragraph ready for an e-reader.']);
        $settings = ['metadata' => [
            'title' => 'The ePub Edition', 'subtitle' => 'A test edition', 'author' => 'Ada Writer', 'publisher' => 'AT Press',
            'publication_date' => '2026-08-20', 'identifier' => '9780000000001', 'language' => 'en',
            'description' => 'A professional ePub test.', 'subjects' => ['Fiction', 'Technology'], 'rights' => '© Ada Writer',
        ], 'reading' => ['direction' => 'ltr', 'include_toc' => true, 'include_title_page' => true, 'chapter_break' => 'heading']];

        $this->putJson("/dashboard/api/books/{$book->key_book}/epub", ['settings' => $settings])
            ->assertOk()
            ->assertJsonPath('data.settings.metadata.title', 'The ePub Edition');

        $response = $this->postJson("/dashboard/api/books/{$book->key_book}/epub/generate", ['settings' => $settings])
            ->assertOk()
            ->assertJsonPath('data.settings.reading.layout', 'reflowable')
            ->assertJsonPath('data.download_url', "/dashboard/api/books/{$book->key_book}/epub/download");

        $book->refresh();
        Storage::disk('public')->assertExists($book->epub_file_path);
        $archive = new \ZipArchive;
        $this->assertTrue($archive->open(Storage::disk('public')->path($book->epub_file_path)) === true);
        $this->assertSame('application/epub+zip', $archive->getFromName('mimetype'));
        $this->assertStringContainsString('The ePub Edition', $archive->getFromName('OEBPS/content.opf'));
        $this->assertStringContainsString('Chapter one', $archive->getFromName('OEBPS/nav.xhtml'));
        $archive->close();

        $this->get("/dashboard/api/books/{$book->key_book}/epub/download")
            ->assertOk()
            ->assertHeader('content-type', 'application/epub+zip');
    }

    public function test_dashboard_can_preview_and_generate_a_print_ready_pdf(): void
    {
        Storage::fake('public');
        $book = $this->createBook();
        app(BookBlockService::class)->saveBlock($book, ['block_uuid' => (string) Str::uuid(), 'type' => 'paragraph', 'sort_order' => 1000, 'content_json' => $this->paragraphJson('A paragraph formatted for the printed PDF.'), 'text_plain' => 'A paragraph formatted for the printed PDF.']);
        $settings = ['metadata' => ['title' => 'Print Edition', 'subtitle' => '', 'author' => null, 'publisher' => 'AT Press', 'rights' => '© Ada Writer'], 'format' => ['size' => 'a5', 'width_mm' => 148, 'height_mm' => 210], 'layout' => ['margin_top' => 20, 'margin_bottom' => 20, 'margin_inside' => 18, 'margin_outside' => 15, 'alignment' => 'justify', 'page_numbers' => true, 'title_page' => true, 'copyright_page' => true, 'chapter_new_page' => true, 'include_cover' => true]];

        $this->postJson("/dashboard/api/books/{$book->key_book}/pdf/preview", ['settings' => $settings])
            ->assertOk()
            ->assertHeader('content-type', 'application/pdf')
            ->assertSee('%PDF-', false);

        $this->postJson("/dashboard/api/books/{$book->key_book}/pdf/generate", ['settings' => $settings])
            ->assertOk()
            ->assertJsonPath('data.settings.format.size', 'a5')
            ->assertJsonPath('data.download_url', "/dashboard/api/books/{$book->key_book}/pdf/download");
        $book->refresh();
        Storage::disk('public')->assertExists($book->pdf_file_path);
        $this->assertStringStartsWith('%PDF-', Storage::disk('public')->get($book->pdf_file_path));
    }

    public function test_dashboard_can_manage_distribution_channel_connections(): void
    {
        $book = $this->createBook();
        $this->getJson("/dashboard/api/books/{$book->key_book}/distribution")
            ->assertOk()
            ->assertJsonPath('data.providers.0.key', 'amazon_kdp');

        $this->putJson("/dashboard/api/books/{$book->key_book}/distribution/draft2digital", ['account_label' => 'My D2D', 'api_token' => 'private-distribution-token'])
            ->assertOk()
            ->assertJsonPath('data.connection.status', 'connected')
            ->assertJsonPath('data.connection.has_token', true);
        $connection = BookDistributionConnection::query()->sole();
        $this->assertSame('private-distribution-token', $connection->api_token);

        $this->deleteJson("/dashboard/api/books/{$book->key_book}/distribution/draft2digital")
            ->assertOk()
            ->assertJsonPath('data.disconnected', true);
        $this->assertDatabaseCount('book_distribution_connections', 0);
    }

    public function test_dashboard_creates_and_lists_language_editions(): void
    {
        $book = $this->createBook();
        $book->update(['lang' => 'it']);

        $this->getJson("/dashboard/api/books/{$book->key_book}/editions")
            ->assertOk()
            ->assertJsonPath('data.editions.0.locale', 'it')
            ->assertJsonPath('data.editions.0.is_original', true);

        $this->postJson("/dashboard/api/books/{$book->key_book}/editions", ['locale' => 'en'])
            ->assertCreated()
            ->assertJsonPath('data.edition.locale', 'en')
            ->assertJsonPath('data.edition.status', 'draft');

        $this->assertDatabaseHas('book_editions', ['book_id' => $book->id, 'locale' => 'en', 'is_original' => false]);
        $this->assertSame(2, BookEdition::query()->where('book_id', $book->id)->count());
    }

    public function test_dashboard_translation_provider_defaults_to_translation_mock_model(): void
    {
        $this->getJson('/dashboard/api/ai/providers?service=translate')
            ->assertOk()
            ->assertJsonPath('data.setting.provider_key', 'mock')
            ->assertJsonPath('data.setting.model', 'mock-translation-v1');
    }

    public function test_dashboard_exposes_managed_and_personal_provider_modes(): void
    {
        $providers = $this->getJson('/dashboard/api/ai/providers?service=translate')
            ->assertOk()
            ->json('data.providers');

        $managed = collect($providers)->firstWhere('provider_key', 'at-openai');
        $personal = collect($providers)->firstWhere('provider_key', 'openai');
        $lmStudio = collect($providers)->firstWhere('provider_key', 'lm-studio');

        $this->assertSame('AT · OpenAI', $managed['name']);
        $this->assertSame('managed', $managed['connection_mode']);
        $this->assertTrue($managed['supports_background_jobs']);
        $this->assertFalse($managed['is_selectable']);
        $this->assertSame('Personal · OpenAI', $personal['name']);
        $this->assertSame('byok', $personal['connection_mode']);
        $this->assertFalse($personal['supports_background_jobs']);
        $this->assertSame('Local · LM Studio', $lmStudio['name']);
        $this->assertSame('local', $lmStudio['connection_mode']);
        $this->assertTrue($lmStudio['is_selectable']);
    }

    public function test_dashboard_loads_only_llm_models_from_lm_studio(): void
    {
        Http::fake([
            'http://127.0.0.1:1234/api/v1/models' => Http::response([
                'models' => [
                    ['type' => 'embedding', 'key' => 'embed-local'],
                    ['type' => 'llm', 'key' => 'google/gemma-4-e4b'],
                ],
            ]),
        ]);

        $this->getJson('/dashboard/api/ai/providers/lm-studio/models')
            ->assertOk()
            ->assertJsonPath('data.models', ['google/gemma-4-e4b']);
    }

    public function test_dashboard_managed_provider_never_saves_a_personal_api_key(): void
    {
        config()->set('ai_providers.defaults.1.is_configured', true);
        config()->set('ai_providers.defaults.1.managed_api_key', 'at-server-openai-key');
        $book = $this->createBook();

        $this->patchJson('/dashboard/api/ai/settings', [
            'service' => 'translate',
            'key_book' => $book->key_book,
            'provider_key' => 'at-openai',
            'model' => 'gpt-5-mini',
            'api_key' => 'must-not-be-stored',
        ])
            ->assertOk()
            ->assertJsonPath('data.setting.provider_key', 'at-openai')
            ->assertJsonPath('data.setting.connection_mode', 'managed')
            ->assertJsonPath('data.setting.supports_background_jobs', true);

        $this->assertDatabaseMissing('ai_provider_credentials', [
            'provider_key' => 'at-openai',
        ]);
    }

    public function test_dashboard_starts_a_background_batch_only_for_configured_at_openai(): void
    {
        config()->set('ai_providers.defaults.1.is_configured', true);
        config()->set('ai_providers.defaults.1.managed_api_key', 'at-server-openai-key');
        Queue::fake();
        AccountCreditBalance::query()->create(['account_id' => $this->user->id, 'available_credits' => 100]);
        $book = $this->createBook();
        app(BookBlockService::class)->saveBlock($book, [
            'block_uuid' => (string) Str::uuid(),
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('A saved source block.'),
            'text_plain' => 'A saved source block.',
        ]);

        $this->postJson("/dashboard/api/books/{$book->key_book}/translation-jobs", [
            'target_locale' => 'en',
            'provider_key' => 'at-openai',
            'model' => 'gpt-5-mini',
            'confirmed' => true,
        ])
            ->assertStatus(202)
            ->assertJsonPath('data.created', true)
            ->assertJsonPath('data.job.status', 'queued')
            ->assertJsonPath('data.job.total_blocks', 1);

        Queue::assertPushed(ProcessBookTranslationJob::class);
        $this->assertDatabaseHas('book_translation_jobs', [
            'book_id' => $book->id,
            'provider_key' => 'at-openai',
            'status' => 'queued',
        ]);
    }

    public function test_dashboard_background_batch_uses_the_managed_server_credential(): void
    {
        config()->set('ai_providers.defaults.1.is_configured', true);
        config()->set('ai_providers.defaults.1.managed_api_key', 'at-server-openai-key');
        $book = $this->createBook();
        $saved = app(BookBlockService::class)->saveBlock($book, [
            'block_uuid' => (string) Str::uuid(),
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Translate this line.'),
            'text_plain' => 'Translate this line.',
        ]);
        $job = BookTranslationJob::query()->create([
            'book_id' => $book->id,
            'target_locale' => 'it',
            'status' => 'queued',
            'provider_key' => 'at-openai',
            'model' => 'gpt-5-mini',
            'total_blocks' => 1,
        ]);
        Http::fake([
            'https://api.openai.com/v1/responses' => Http::response([
                'id' => 'resp_managed_batch',
                'output_text' => 'Traduci questa riga.',
            ]),
        ]);

        (new ProcessBookTranslationJob($job->id))->handle(
            app(EditorAiTranslationService::class),
            app(TranslationCreditService::class),
        );

        $job->refresh();
        $this->assertSame('completed', $job->status);
        $this->assertSame(1, $job->completed_blocks);
        $this->assertDatabaseHas('book_block_translations', [
            'book_id' => $book->id,
            'block_uuid' => $saved['block']->block_uuid,
            'provider_key' => 'at-openai',
            'translated_text' => 'Traduci questa riga.',
        ]);
        Http::assertSent(fn ($request) => $request->hasHeader('Authorization', 'Bearer at-server-openai-key'));
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

        Storage::disk('local')->assertExists("bookEdit/{$this->user->id}/{$book->key_book}.json");
    }

    public function test_dashboard_returns_translation_progress_for_current_block_versions(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $firstBlock = $service->saveBlock($book, [
            'block_uuid' => (string) Str::uuid(),
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Approved source.'),
            'text_plain' => 'Approved source.',
        ]);
        $secondBlock = $service->saveBlock($book, [
            'block_uuid' => (string) Str::uuid(),
            'type' => 'paragraph',
            'sort_order' => 2000,
            'content_json' => $this->paragraphJson('Missing source.'),
            'text_plain' => 'Missing source.',
        ]);

        $service->saveBlock($book, [
            'block_uuid' => (string) Str::uuid(),
            'type' => 'chapter_break',
            'sort_order' => 3000,
            'content_json' => $this->paragraphJson(''),
            'text_plain' => '   ',
        ]);

        BookBlockTranslation::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $firstBlock['block']->id,
            'source_book_block_version_id' => $firstBlock['version']->id,
            'block_uuid' => $firstBlock['block']->block_uuid,
            'target_locale' => 'it',
            'status' => 'approved',
            'provider_key' => 'mock',
            'model' => 'mock-translation-v1',
            'source' => 'mock',
            'source_text' => 'Approved source.',
            'translated_text' => 'Sorgente approvata.',
        ]);

        $this->getJson("/dashboard/api/books/{$book->key_book}/translation-progress?target_locale=it")
            ->assertOk()
            ->assertJsonPath('data.counts.all', 2)
            ->assertJsonPath('data.counts.approved', 1)
            ->assertJsonPath('data.counts.missing', 1)
            ->assertJsonPath("data.states.{$firstBlock['block']->block_uuid}", 'approved')
            ->assertJsonPath("data.states.{$secondBlock['block']->block_uuid}", 'missing');
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

    public function test_dashboard_book_ai_provider_settings_fall_back_to_global_default(): void
    {
        $book = $this->createBook();

        $this->patchJson('/dashboard/api/ai/settings', [
            'service' => 'chat',
            'provider_key' => 'openai',
            'model' => 'gpt-5-mini',
            'api_key' => 'sk-global-chat',
            'system_prompt' => 'Use the global chat default.',
        ])
            ->assertOk()
            ->assertJsonPath('data.setting.service', 'chat')
            ->assertJsonPath('data.setting.provider_key', 'openai')
            ->assertJsonPath('data.setting.model', 'gpt-5-mini')
            ->assertJsonPath('data.setting.system_prompt', 'Use the global chat default.');

        $this->getJson("/dashboard/api/ai/providers?service=chat&key_book={$book->key_book}")
            ->assertOk()
            ->assertJsonPath('data.setting.service', 'chat')
            ->assertJsonPath('data.setting.provider_key', 'openai')
            ->assertJsonPath('data.setting.model', 'gpt-5-mini')
            ->assertJsonPath('data.setting.system_prompt', 'Use the global chat default.');
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

        Queue::fake();
        $this->postJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/audio/generate", [
            'provider_key' => 'mock',
            'model' => 'mock-tts-v1',
        ])->assertAccepted();

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
            ->assertJsonPath('data.versions.0.activity.audio', 0)
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

    public function test_dashboard_can_explain_editor_block_version_changes(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::uuid();

        $first = $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('First short paragraph.'),
            'text_plain' => 'First short paragraph.',
        ]);

        $second = $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'base_version_id' => $first['version']->id,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Second paragraph with a little more detail.'),
            'text_plain' => 'Second paragraph with a little more detail.',
        ]);

        $this->postJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/versions/explain", [
            'version_id' => $first['version']->id,
            'compare_version_id' => $second['version']->id,
            'provider_key' => 'mock',
            'model' => 'mock-correction-v1',
        ])
            ->assertCreated()
            ->assertJsonPath('data.thread.scope', 'versions')
            ->assertJsonPath('data.thread.book_block_version_id', $first['version']->id)
            ->assertJsonPath('data.explanation.provider_key', 'mock')
            ->assertJsonPath('data.explanation.metadata.from_version_id', $first['version']->id)
            ->assertJsonPath('data.explanation.metadata.to_version_id', $second['version']->id);

        $this->assertDatabaseHas('ai_chat_threads', [
            'book_id' => $book->id,
            'book_block_id' => $first['block']->id,
            'book_block_version_id' => $first['version']->id,
            'scope' => 'versions',
        ]);

        $this->getJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/versions")
            ->assertOk()
            ->assertJsonPath('data.versions.1.explanation.provider_key', 'mock')
            ->assertJsonPath('data.versions.1.explanation.metadata.from_version_number', 1)
            ->assertJsonPath('data.versions.1.explanation.metadata.to_version_number', 2);
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

    public function test_dashboard_can_create_openai_translation_with_book_glossary(): void
    {
        Http::fake([
            'https://api.openai.com/v1/responses' => Http::response([
                'id' => 'resp_translation_123',
                'output_text' => 'Liora entrò nel Bosco di Mezzanotte.',
            ]),
        ]);

        $book = $this->createBook();
        $book->update(['lang' => 'en']);
        $book->translationTerms()->create([
            'source_term' => 'Midnight Wood',
            'target_term' => 'Bosco di Mezzanotte',
            'target_locale' => 'it',
            'notes' => 'Official place name',
        ]);
        $blockUuid = (string) Str::uuid();
        app(BookBlockService::class)->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Liora entered the Midnight Wood.'),
            'text_plain' => 'Liora entered the Midnight Wood.',
        ]);

        $this->patchJson('/dashboard/api/ai/settings', [
            'service' => 'translate',
            'key_book' => $book->key_book,
            'provider_key' => 'openai',
            'model' => 'gpt-5-mini',
            'api_key' => 'sk-translation-openai',
            'system_prompt' => 'Translate literary text only.',
        ])->assertOk();

        $this->postJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/translations", [
            'target_locale' => 'it',
            'provider_key' => 'openai',
            'model' => 'gpt-5-mini',
        ])
            ->assertCreated()
            ->assertJsonPath('data.translation.source', 'ai')
            ->assertJsonPath('data.translation.translated_text', 'Liora entrò nel Bosco di Mezzanotte.')
            ->assertJsonPath('data.translation.notes_json.provider_key', 'openai')
            ->assertJsonPath('data.translation.notes_json.glossary_terms_count', 1);

        Http::assertSent(fn ($request) => $request->url() === 'https://api.openai.com/v1/responses'
            && $request->hasHeader('Authorization', 'Bearer sk-translation-openai')
            && $request['model'] === 'gpt-5-mini'
            && $request['store'] === false
            && str_contains($request['input'][1]['content'][0]['text'], 'Midnight Wood → Bosco di Mezzanotte'));
    }

    public function test_dashboard_can_create_lm_studio_translation_without_an_api_key(): void
    {
        Http::fake([
            'http://127.0.0.1:1234/api/v1/models' => Http::response([
                'models' => [['type' => 'llm', 'key' => 'google/gemma-4-e4b']],
            ]),
            'http://127.0.0.1:1234/v1/chat/completions' => Http::response([
                'id' => 'chatcmpl_lmstudio_123',
                'choices' => [['message' => ['content' => 'La foresta era silenziosa.']]],
            ]),
        ]);

        $book = $this->createBook();
        $book->update(['lang' => 'en']);
        $blockUuid = (string) Str::uuid();
        app(BookBlockService::class)->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('The forest was silent.'),
            'text_plain' => 'The forest was silent.',
        ]);

        $this->patchJson('/dashboard/api/ai/settings', [
            'service' => 'translate',
            'key_book' => $book->key_book,
            'provider_key' => 'lm-studio',
            'model' => 'google/gemma-4-e4b',
        ])->assertOk();

        $this->postJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/translations", [
            'target_locale' => 'it',
            'provider_key' => 'lm-studio',
            'model' => 'google/gemma-4-e4b',
        ])
            ->assertCreated()
            ->assertJsonPath('data.translation.translated_text', 'La foresta era silenziosa.')
            ->assertJsonPath('data.translation.notes_json.endpoint', 'http://127.0.0.1:1234/v1/chat/completions');

        Http::assertSent(fn ($request) => $request->url() === 'http://127.0.0.1:1234/v1/chat/completions'
            && $request['model'] === 'google/gemma-4-e4b');
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

    public function test_dashboard_can_create_comment_for_specific_block_version(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::uuid();

        $first = $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Older paragraph.'),
            'text_plain' => 'Older paragraph.',
        ]);

        $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'base_version_id' => $first['version']->id,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Current paragraph.'),
            'text_plain' => 'Current paragraph.',
        ]);

        $this->postJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/comments", [
            'body' => 'Review this old version before restoring.',
            'book_block_version_id' => $first['version']->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.comment.block_version_id', $first['version']->id)
            ->assertJsonPath('data.comment.version_number', 1)
            ->assertJsonPath('data.comment.is_current_version', false);
    }

    public function test_dashboard_can_create_block_comment_with_text_anchor(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::uuid();

        $saved = $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Paragraph with an anchored sentence.'),
            'text_plain' => 'Paragraph with an anchored sentence.',
        ]);

        $this->postJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/comments", [
            'body' => 'This note targets a sentence.',
            'metadata_json' => [
                'anchor' => [
                    'type' => 'text-selection',
                    'block_uuid' => $blockUuid,
                    'offset_start' => 15,
                    'offset_end' => 32,
                    'text' => 'anchored sentence',
                ],
            ],
        ])
            ->assertCreated()
            ->assertJsonPath('data.comment.metadata_json.anchor.type', 'text-selection')
            ->assertJsonPath('data.comment.metadata_json.anchor.block_uuid', $blockUuid)
            ->assertJsonPath('data.comment.metadata_json.anchor.text', 'anchored sentence');

        $this->assertDatabaseHas('book_block_comments', [
            'book_id' => $book->id,
            'book_block_id' => $saved['block']->id,
            'book_block_version_id' => $saved['version']->id,
            'body' => 'This note targets a sentence.',
        ]);
    }

    public function test_dashboard_can_update_block_comment_anchor_metadata(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $blockUuid = (string) Str::uuid();

        $saved = $service->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Paragraph with updated anchor text.'),
            'text_plain' => 'Paragraph with updated anchor text.',
        ]);

        $comment = BookBlockComment::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $saved['block']->id,
            'book_block_version_id' => $saved['version']->id,
            'block_uuid' => $blockUuid,
            'status' => 'open',
            'body' => 'Move this anchor.',
            'metadata_json' => [
                'anchor' => [
                    'type' => 'text-selection',
                    'block_uuid' => $blockUuid,
                    'offset_start' => 0,
                    'offset_end' => 9,
                    'text' => 'Paragraph',
                ],
            ],
        ]);

        $this->patchJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/comments/{$comment->id}", [
            'book_block_version_id' => $saved['version']->id,
            'metadata_json' => [
                'anchor' => [
                    'type' => 'text-selection',
                    'block_uuid' => $blockUuid,
                    'offset_start' => 15,
                    'offset_end' => 34,
                    'text' => 'updated anchor text',
                ],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('data.comment.status', 'open')
            ->assertJsonPath('data.comment.block_version_id', $saved['version']->id)
            ->assertJsonPath('data.comment.metadata_json.anchor.text', 'updated anchor text')
            ->assertJsonPath('data.comment.metadata_json.anchor.offset_start', 15);
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

    public function test_dashboard_can_return_comment_summary_for_book_blocks(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $firstBlockUuid = (string) Str::uuid();
        $secondBlockUuid = (string) Str::uuid();

        $firstVersion = $service->saveBlock($book, [
            'block_uuid' => $firstBlockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('First block.'),
            'text_plain' => 'First block.',
        ]);

        $secondVersion = $service->saveBlock($book, [
            'block_uuid' => $firstBlockUuid,
            'base_version_id' => $firstVersion['version']->id,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('First block updated.'),
            'text_plain' => 'First block updated.',
        ]);

        $otherBlock = $service->saveBlock($book, [
            'block_uuid' => $secondBlockUuid,
            'type' => 'paragraph',
            'sort_order' => 2000,
            'content_json' => $this->paragraphJson('Second block.'),
            'text_plain' => 'Second block.',
        ]);

        BookBlockComment::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $secondVersion['block']->id,
            'book_block_version_id' => $secondVersion['version']->id,
            'block_uuid' => $firstBlockUuid,
            'status' => 'open',
            'body' => 'Current open note.',
        ]);
        BookBlockComment::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $secondVersion['block']->id,
            'book_block_version_id' => $firstVersion['version']->id,
            'block_uuid' => $firstBlockUuid,
            'status' => 'open',
            'body' => 'Old version note.',
        ]);
        BookBlockComment::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $otherBlock['block']->id,
            'book_block_version_id' => $otherBlock['version']->id,
            'block_uuid' => $secondBlockUuid,
            'status' => 'resolved',
            'body' => 'Resolved note.',
        ]);

        $this->getJson("/dashboard/api/books/{$book->key_book}/comments/summary")
            ->assertOk()
            ->assertJsonPath('data.summaries.0.block_uuid', $firstBlockUuid)
            ->assertJsonPath('data.summaries.0.all', 2)
            ->assertJsonPath('data.summaries.0.open', 1)
            ->assertJsonPath('data.summaries.0.resolved', 0)
            ->assertJsonPath('data.summaries.0.stale', 1)
            ->assertJsonPath('data.summaries.1.block_uuid', $secondBlockUuid)
            ->assertJsonPath('data.summaries.1.all', 1)
            ->assertJsonPath('data.summaries.1.open', 0)
            ->assertJsonPath('data.summaries.1.resolved', 1)
            ->assertJsonPath('data.summaries.1.stale', 0);
    }

    public function test_dashboard_can_return_book_activity_queue(): void
    {
        $book = $this->createBook();
        $service = app(BookBlockService::class);
        $firstBlockUuid = (string) Str::uuid();
        $secondBlockUuid = (string) Str::uuid();

        $firstBlock = $service->saveBlock($book, [
            'block_uuid' => $firstBlockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('First activity block.'),
            'text_plain' => 'First activity block.',
        ]);

        $secondBlock = $service->saveBlock($book, [
            'block_uuid' => $secondBlockUuid,
            'type' => 'paragraph',
            'sort_order' => 2000,
            'content_json' => $this->paragraphJson('Second activity block.'),
            'text_plain' => 'Second activity block.',
        ]);

        $review = BookBlockReview::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $firstBlock['block']->id,
            'book_block_version_id' => $firstBlock['version']->id,
            'type' => 'grammar',
            'status' => 'draft',
            'source' => 'ai',
            'original_text' => 'First activity block.',
            'suggested_text' => 'First activity block improved.',
        ]);

        BookBlockComment::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $firstBlock['block']->id,
            'book_block_version_id' => $firstBlock['version']->id,
            'block_uuid' => $firstBlockUuid,
            'status' => 'open',
            'body' => 'Review this sentence.',
        ]);

        $translation = BookBlockTranslation::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $secondBlock['block']->id,
            'source_book_block_version_id' => $secondBlock['version']->id,
            'block_uuid' => $secondBlockUuid,
            'target_locale' => 'en',
            'status' => 'draft',
            'provider_key' => 'mock',
            'model' => 'mock-translate-v1',
            'source' => 'mock',
            'source_text' => 'Second activity block.',
            'translated_text' => 'Second activity block translated.',
        ]);

        $voice = BookVoiceProfile::query()->create([
            'book_id' => $book->id,
            'name' => 'Narrator',
            'role' => 'narrator',
            'voice_provider' => 'mock',
            'voice_id' => 'narrator-1',
            'language' => 'it',
        ]);

        BookBlockVoiceAssignment::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $secondBlock['block']->id,
            'book_block_version_id' => $secondBlock['version']->id,
            'book_voice_profile_id' => $voice->id,
            'block_uuid' => $secondBlockUuid,
            'source' => 'manual',
        ]);

        $this->getJson("/dashboard/api/books/{$book->key_book}/activity")
            ->assertOk()
            ->assertJsonPath('data.summary.all', 4)
            ->assertJsonPath('data.summary.action', 3)
            ->assertJsonPath('data.summary.review', 1)
            ->assertJsonPath('data.items.0.type', 'draft_reviews')
            ->assertJsonPath('data.items.0.tool', 'correct')
            ->assertJsonPath('data.items.0.title', 'Correction draft ready')
            ->assertJsonPath('data.items.0.action_target.id', $review->id)
            ->assertJsonPath('data.items.1.type', 'draft_translations')
            ->assertJsonPath('data.items.1.tool', 'translate')
            ->assertJsonPath('data.items.1.title', 'Translation draft ready')
            ->assertJsonPath('data.items.1.action_target.id', $translation->id)
            ->assertJsonPath('data.items.2.type', 'audio_missing')
            ->assertJsonPath('data.items.2.tool', 'audio')
            ->assertJsonPath('data.items.2.title', 'Audio not generated')
            ->assertJsonPath('data.items.3.type', 'comments')
            ->assertJsonPath('data.items.3.tool', 'comments')
            ->assertJsonPath('data.items.3.title', 'Comments need review');
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
        Queue::fake();
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
            ->assertAccepted()
            ->assertJsonPath('data.job.status', 'queued')
            ->assertJsonPath('data.job.provider_key', 'mock')
            ->assertJsonPath('data.job.model', 'mock-tts-v1')
            ->assertJsonPath('data.job.voice_profile.name', 'Narrator');

        Queue::assertPushed(ProcessBookAudioJob::class, fn (ProcessBookAudioJob $queued) => $queued->audioJobId > 0 && $queued->queue === 'tts');

        $this->assertDatabaseHas('book_audio_jobs', [
            'book_id' => $book->id,
            'book_block_id' => $saved['block']->id,
            'book_block_version_id' => $saved['version']->id,
            'book_voice_profile_id' => $profile->id,
            'status' => 'queued',
            'provider_key' => 'mock',
            'model' => 'mock-tts-v1',
        ]);

        $audioJob = BookAudioJob::query()->latest('id')->firstOrFail();
        app(BookAudioGenerationService::class)->generate($audioJob->id);

        $this->assertDatabaseHas('book_audio_jobs', ['id' => $audioJob->id, 'status' => 'completed']);
        $this->assertDatabaseHas('book_audio_segments', [
            'book_audio_job_id' => $audioJob->id,
            'status' => 'completed',
            'voice_id' => 'narrator-main',
            'text_plain' => 'Paragraph for generated audio.',
        ]);

        $this->getJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/audio")
            ->assertOk()
            ->assertJsonPath('data.assignment.voice_profile.name', 'Narrator')
            ->assertJsonPath('data.groups.0.status', 'completed');
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

    public function test_dashboard_can_remove_a_clip_from_its_audio_timeline(): void
    {
        $book = $this->createBook();
        $clip = BookAudioTimelineItem::query()->create([
            'book_id' => $book->id,
            'track' => 'voice',
            'label' => 'Narration',
            'start_ms' => 0,
            'duration_ms' => 3000,
            'sort_order' => 0,
        ]);

        $this->deleteJson("/dashboard/api/books/{$book->key_book}/audio-timeline/{$clip->id}")
            ->assertOk()
            ->assertJsonPath('data.deleted', true);

        $this->assertDatabaseMissing('book_audio_timeline_items', ['id' => $clip->id]);
    }

    public function test_dashboard_publish_returns_the_three_channel_contract_when_timeline_is_empty(): void
    {
        $book = $this->createBook();

        $this->postJson("/dashboard/api/books/{$book->key_book}/audio-publish")
            ->assertOk()
            ->assertJsonPath('data.channels.voice.status', 'empty')
            ->assertJsonPath('data.channels.music.status', 'empty')
            ->assertJsonPath('data.channels.fx.status', 'empty')
            ->assertJsonPath('data.duration_ms', 0);
    }

    public function test_dashboard_ungroups_a_trimmed_audio_master_without_restoring_hidden_audio(): void
    {
        $book = $this->createBook();
        $blockUuid = (string) Str::uuid();
        $saved = app(BookBlockService::class)->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('A generated narration.'),
            'text_plain' => 'A generated narration.',
        ]);
        $job = BookAudioJob::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $saved['block']->id,
            'book_block_version_id' => $saved['version']->id,
            'block_uuid' => $blockUuid,
            'status' => 'completed',
            'provider_key' => 'mock',
            'source' => 'mock',
        ]);
        $first = BookAudioSegment::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $saved['block']->id,
            'book_block_version_id' => $saved['version']->id,
            'book_audio_job_id' => $job->id,
            'block_uuid' => $blockUuid,
            'audio_path' => 'audiobooks/test/first.wav',
            'duration_ms' => 1000,
            'pause_after_ms' => 200,
            'segment_index' => 0,
            'text_plain' => 'First sentence.',
        ]);
        $second = BookAudioSegment::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $saved['block']->id,
            'book_block_version_id' => $saved['version']->id,
            'book_audio_job_id' => $job->id,
            'block_uuid' => $blockUuid,
            'audio_path' => 'audiobooks/test/second.wav',
            'duration_ms' => 1000,
            'segment_index' => 1,
            'text_plain' => 'Second sentence.',
        ]);
        $master = BookAudioTimelineItem::query()->create([
            'book_id' => $book->id,
            'book_audio_segment_id' => $first->id,
            'book_audio_job_id' => $job->id,
            'is_group' => true,
            'track' => 'voice',
            'lane' => 2,
            'label' => 'Narration group',
            'start_ms' => 10000,
            'duration_ms' => 1500,
            'trim_start_ms' => 400,
            'trim_end_ms' => 300,
            'fade_in_ms' => 300,
            'fade_out_ms' => 300,
            'volume' => 65,
            'muted' => true,
            'sort_order' => 0,
        ]);

        $this->postJson("/dashboard/api/books/{$book->key_book}/audio-timeline/{$master->id}/ungroup")
            ->assertOk()
            ->assertJsonCount(2, 'data.items');

        $this->assertDatabaseMissing('book_audio_timeline_items', ['id' => $master->id]);
        $this->assertDatabaseHas('book_audio_timeline_items', [
            'book_audio_segment_id' => $first->id,
            'start_ms' => 10000,
            'duration_ms' => 600,
            'trim_start_ms' => 400,
            'trim_end_ms' => 0,
            'fade_in_ms' => 300,
            'fade_out_ms' => 0,
            'volume' => 65,
            'muted' => true,
        ]);
        $this->assertDatabaseHas('book_audio_timeline_items', [
            'book_audio_segment_id' => $second->id,
            'start_ms' => 10800,
            'duration_ms' => 700,
            'trim_start_ms' => 0,
            'trim_end_ms' => 300,
            'fade_in_ms' => 0,
            'fade_out_ms' => 300,
            'volume' => 65,
            'muted' => true,
        ]);
    }

    public function test_dashboard_can_group_and_ungroup_selected_timeline_clips_without_changing_them(): void
    {
        $book = $this->createBook();
        $first = BookAudioTimelineItem::query()->create([
            'book_id' => $book->id, 'track' => 'music', 'lane' => 1, 'label' => 'Intro',
            'start_ms' => 1000, 'duration_ms' => 2000, 'trim_start_ms' => 250, 'volume' => 70, 'sort_order' => 0,
        ]);
        $second = BookAudioTimelineItem::query()->create([
            'book_id' => $book->id, 'track' => 'music', 'lane' => 1, 'label' => 'Theme',
            'start_ms' => 4500, 'duration_ms' => 1500, 'trim_end_ms' => 150, 'volume' => 55, 'muted' => true, 'sort_order' => 1,
        ]);

        $grouped = $this->postJson("/dashboard/api/books/{$book->key_book}/audio-timeline/group", [
            'item_ids' => [$first->id, $second->id],
        ])
            ->assertCreated()
            ->assertJsonStructure(['data' => ['master_id']]);
        $masterId = $grouped->json('data.master_id');

        $this->assertDatabaseHas('book_audio_timeline_items', [
            'id' => $masterId, 'is_group' => true, 'track' => 'music', 'lane' => 1, 'start_ms' => 1000, 'duration_ms' => 5000,
        ]);
        $this->assertDatabaseHas('book_audio_timeline_items', ['id' => $first->id, 'parent_timeline_item_id' => $masterId]);
        $this->assertDatabaseHas('book_audio_timeline_items', ['id' => $second->id, 'parent_timeline_item_id' => $masterId]);

        $this->postJson("/dashboard/api/books/{$book->key_book}/audio-timeline/{$masterId}/ungroup")
            ->assertOk()
            ->assertJsonCount(2, 'data.items');

        $this->assertDatabaseMissing('book_audio_timeline_items', ['id' => $masterId]);
        $this->assertDatabaseHas('book_audio_timeline_items', ['id' => $first->id, 'parent_timeline_item_id' => null, 'trim_start_ms' => 250, 'volume' => 70]);
        $this->assertDatabaseHas('book_audio_timeline_items', ['id' => $second->id, 'parent_timeline_item_id' => null, 'trim_end_ms' => 150, 'volume' => 55, 'muted' => true]);
    }

    public function test_dashboard_can_delete_an_unused_generated_audio_master_only(): void
    {
        Storage::fake('public');
        $book = $this->createBook();
        $blockUuid = (string) Str::uuid();
        $saved = app(BookBlockService::class)->saveBlock($book, [
            'block_uuid' => $blockUuid,
            'type' => 'paragraph',
            'sort_order' => 1000,
            'content_json' => $this->paragraphJson('Generated narration.'),
            'text_plain' => 'Generated narration.',
        ]);
        $job = BookAudioJob::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $saved['block']->id,
            'book_block_version_id' => $saved['version']->id,
            'block_uuid' => $blockUuid,
            'status' => 'completed',
            'provider_key' => 'mock',
            'source' => 'mock',
        ]);
        $segment = BookAudioSegment::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $saved['block']->id,
            'book_block_version_id' => $saved['version']->id,
            'book_audio_job_id' => $job->id,
            'block_uuid' => $blockUuid,
            'audio_path' => 'audiobooks/test/segment.wav',
            'duration_ms' => 1000,
        ]);
        Storage::disk('public')->put($segment->audio_path, 'audio');

        $this->deleteJson("/dashboard/api/books/{$book->key_book}/blocks/{$blockUuid}/audio/{$job->id}")
            ->assertOk()
            ->assertJsonPath('data.deleted', true);

        $this->assertDatabaseMissing('book_audio_jobs', ['id' => $job->id]);
        $this->assertDatabaseMissing('book_audio_segments', ['id' => $segment->id]);
        Storage::disk('public')->assertMissing($segment->audio_path);
    }

    public function test_dashboard_can_update_book_workspace_settings(): void
    {
        $book = $this->createBook();
        $category = BookCategory::query()->create(['name' => 'Fantasy', 'slug' => 'fantasy']);

        $this->patchJson("/dashboard/api/books/{$book->key_book}", [
            'title' => 'Italian audiobook',
            'description' => 'A book configured for Italian narration.',
            'categories' => [$category->id],
            'lang' => 'it',
            'cover_img' => '/storage/covers/italian-audiobook.jpg',
        ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Italian audiobook')
            ->assertJsonPath('data.lang', 'it')
            ->assertJsonPath('data.categories.0', $category->id);

        $this->assertDatabaseHas('books', [
            'id' => $book->id,
            'name' => 'Italian audiobook',
            'lang' => 'it',
        ]);
    }

    private function createBook(): Book
    {
        return Book::query()->create([
            'account_id' => $this->user->id,
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
