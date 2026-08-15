<?php

namespace App\Http\Controllers;

use App\Exceptions\BookBlockVersionConflictException;
use App\Jobs\ProcessBookTranslationJob;
use App\Models\AiChatMessage;
use App\Models\AiChatThread;
use App\Models\AudioLibraryVoice;
use App\Models\AudioLibraryVoiceSample;
use App\Models\AudioMediaAsset;
use App\Models\Book;
use App\Models\BookAudioJob;
use App\Models\BookAudioSegment;
use App\Models\BookAudioTimelineItem;
use App\Models\BookBlock;
use App\Models\BookBlockComment;
use App\Models\BookBlockReview;
use App\Models\BookBlockTranslation;
use App\Models\BookBlockVoiceAssignment;
use App\Models\BookCategory;
use App\Models\BookTranslationJob;
use App\Models\BookTranslationTerm;
use App\Models\BookVoiceProfile;
use App\Services\Ai\EditorAiChatService;
use App\Services\Ai\EditorAiCorrectionService;
use App\Services\Ai\EditorAiTranslationService;
use App\Services\Ai\EditorAiVersionService;
use App\Services\BookBlockService;
use App\Services\CoquiTtsService;
use App\Services\AudioTextSegmenter;
use App\Services\Credits\TranslationCreditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class DashboardBookController extends Controller
{
    public function categories(): JsonResponse
    {
        $categories = BookCategory::query()
            ->orderBy('name')
            ->get(['id', 'name']);

        return response()->json(['data' => $categories]);
    }

    public function index(): JsonResponse
    {
        $books = Book::query()
            ->where('account_id', auth()->id())
            ->latest('updated_at')
            ->get([
                'id',
                'key_book',
                'name',
                'description',
                'categories',
                'lang',
                'cover_img',
                'updated_at',
            ]);

        return response()->json([
            'data' => $books->map(fn (Book $book) => [
                'id' => $book->id,
                'key_book' => $book->key_book,
                'name' => $book->name,
                'description' => $book->description,
                'categories' => $book->categories ?? [],
                'categories_count' => count($book->categories ?? []),
                'lang' => $book->lang,
                'cover_img' => $book->cover_img,
                'audio_settings' => [...AudioTextSegmenter::DEFAULT_PAUSES, ...($book->audio_settings_json ?? [])],
                'updated_at' => $book->updated_at?->toIso8601String(),
            ])->values(),
        ]);
    }

    public function show(string $keyBook): JsonResponse
    {
        $book = Book::query()
            ->where('account_id', auth()->id())
            ->where('key_book', $keyBook)
            ->firstOrFail([
                'id',
                'key_book',
                'name',
                'description',
                'categories',
                'lang',
                'cover_img',
                'updated_at',
            ]);

        return response()->json([
            'data' => [
                'id' => $book->id,
                'key_book' => $book->key_book,
                'name' => $book->name,
                'description' => $book->description,
                'categories_count' => count($book->categories ?? []),
                'lang' => $book->lang,
                'cover_img' => $book->cover_img,
                'updated_at' => $book->updated_at?->toIso8601String(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:180'],
            'description' => ['nullable', 'string', 'max:5000'],
            'categories' => ['nullable', 'array'],
            'categories.*' => ['integer', 'exists:book_categories,id'],
        ]);

        $accountId = auth()->id();
        $keyBook = md5(($accountId ?: 'guest').'-'.$validated['title'].'-'.microtime(true).'-'.Str::random(8));

        $book = Book::query()->create([
            'account_id' => $accountId,
            'key_book' => $keyBook,
            'id_file' => 0,
            'name' => $validated['title'],
            'description' => $validated['description'] ?? '',
            'categories' => $validated['categories'] ?? [],
        ]);

        Storage::disk('local')->put('bookEdit/'.($accountId ?: 'guest')."/{$keyBook}.json", '');

        return response()->json([
            'data' => [
                'id' => $book->id,
                'key_book' => $book->key_book,
                'name' => $book->name,
            ],
        ], 201);
    }

    public function update(Request $request, string $keyBook): JsonResponse
    {
        $localeKeys = array_keys(config('audiobook.locales', []));
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:180'],
            'description' => ['nullable', 'string', 'max:5000'],
            'categories' => ['nullable', 'array'],
            'categories.*' => ['integer', 'exists:book_categories,id'],
            'lang' => ['nullable', 'string', 'max:12', Rule::in($localeKeys)],
            'cover_img' => ['nullable', 'string', 'max:2048'],
            'audio_settings' => ['nullable', 'array'],
            'audio_settings.comma_ms' => ['nullable', 'integer', 'min:0', 'max:5000'],
            'audio_settings.semicolon_ms' => ['nullable', 'integer', 'min:0', 'max:5000'],
            'audio_settings.sentence_ms' => ['nullable', 'integer', 'min:0', 'max:5000'],
            'audio_settings.newline_ms' => ['nullable', 'integer', 'min:0', 'max:5000'],
            'audio_settings.ellipsis_ms' => ['nullable', 'integer', 'min:0', 'max:5000'],
            'audio_settings.dash_ms' => ['nullable', 'integer', 'min:0', 'max:5000'],
        ]);

        $book = Book::query()
            ->where('account_id', auth()->id())
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $book->fill([
            'name' => trim($validated['title']),
            'description' => $validated['description'] ?? '',
            'categories' => array_values($validated['categories'] ?? []),
            'lang' => $validated['lang'] ?: null,
            'cover_img' => $validated['cover_img'] ?: null,
            'audio_settings_json' => [...AudioTextSegmenter::DEFAULT_PAUSES, ...($validated['audio_settings'] ?? $book->audio_settings_json ?? [])],
        ])->save();

        return response()->json([
            'data' => [
                'id' => $book->id,
                'key_book' => $book->key_book,
                'name' => $book->name,
                'description' => $book->description,
                'categories' => $book->categories ?? [],
                'categories_count' => count($book->categories ?? []),
                'lang' => $book->lang,
                'cover_img' => $book->cover_img,
                'audio_settings' => [...AudioTextSegmenter::DEFAULT_PAUSES, ...($book->audio_settings_json ?? [])],
                'updated_at' => $book->updated_at?->toIso8601String(),
            ],
        ]);
    }

    public function translationTerms(Request $request, string $keyBook): JsonResponse
    {
        $targetLocale = strtolower((string) $request->query('target_locale', ''));
        $book = Book::query()->where('key_book', $keyBook)->firstOrFail();

        $terms = $book->translationTerms()
            ->when($targetLocale !== '', fn ($query) => $query->where('target_locale', $targetLocale))
            ->orderBy('source_term')
            ->get()
            ->map(fn (BookTranslationTerm $term) => $this->serializeTranslationTerm($term))
            ->values();

        return response()->json(['data' => ['terms' => $terms]]);
    }

    public function translationProgress(Request $request, string $keyBook): JsonResponse
    {
        $validated = $request->validate([
            'target_locale' => ['required', 'string', 'max:20'],
        ]);
        $book = Book::query()->where('key_book', $keyBook)->firstOrFail();
        $targetLocale = strtolower($validated['target_locale']);
        $blocks = $book->blocks()
            ->where('status', '!=', 'deleted')
            ->whereNotNull('current_version_id')
            ->get(['id', 'block_uuid', 'current_version_id']);
        $currentVersionIds = $blocks->pluck('current_version_id')->all();

        $latestTranslations = BookBlockTranslation::query()
            ->where('book_id', $book->id)
            ->where('target_locale', $targetLocale)
            ->whereIn('source_book_block_version_id', $currentVersionIds)
            ->latest('updated_at')
            ->latest('id')
            ->get(['book_block_id', 'source_book_block_version_id', 'status'])
            ->groupBy('book_block_id')
            ->map(fn ($translations) => $translations->first());

        $states = $blocks->mapWithKeys(function (BookBlock $block) use ($latestTranslations) {
            $translation = $latestTranslations->get($block->id);

            return [$block->block_uuid => $translation?->status ?? 'missing'];
        });
        $counts = [
            'all' => $blocks->count(),
            'missing' => $states->filter(fn (string $status) => $status === 'missing')->count(),
            'draft' => $states->filter(fn (string $status) => $status === 'draft')->count(),
            'approved' => $states->filter(fn (string $status) => $status === 'approved')->count(),
            'rejected' => $states->filter(fn (string $status) => $status === 'rejected')->count(),
        ];

        return response()->json([
            'data' => [
                'target_locale' => $targetLocale,
                'counts' => $counts,
                'states' => $states,
            ],
        ]);
    }

    public function translationJob(Request $request, string $keyBook): JsonResponse
    {
        $validated = $request->validate([
            'target_locale' => ['required', 'string', 'max:20'],
        ]);
        $book = Book::query()->where('key_book', $keyBook)->firstOrFail();
        $job = $book->translationJobs()
            ->where('target_locale', strtolower($validated['target_locale']))
            ->latest('id')
            ->first();

        return response()->json([
            'data' => [
                'job' => $job ? $this->serializeTranslationJob($job) : null,
            ],
        ]);
    }

    public function startTranslationJob(Request $request, string $keyBook, TranslationCreditService $credits): JsonResponse
    {
        $validated = $request->validate([
            'target_locale' => ['required', 'string', 'max:20'],
            'provider_key' => ['required', 'in:at-openai'],
            'model' => ['required', 'string', 'max:120'],
            'confirmed' => ['accepted'],
        ]);
        $provider = collect(config('ai_providers.defaults', []))->firstWhere('provider_key', 'at-openai');
        abort_unless($provider && ($provider['is_configured'] ?? false), 422, 'AT · OpenAI is not configured yet.');
        abort_unless(in_array($validated['model'], $provider['models'] ?? [], true), 422, 'The selected AT · OpenAI model is not available.');

        $book = Book::query()->where('key_book', $keyBook)->firstOrFail();
        $targetLocale = strtolower($validated['target_locale']);
        $activeJob = $book->translationJobs()
            ->where('target_locale', $targetLocale)
            ->whereIn('status', ['queued', 'running'])
            ->latest('id')
            ->first();

        if ($activeJob) {
            return response()->json([
                'data' => [
                    'job' => $this->serializeTranslationJob($activeJob),
                    'created' => false,
                ],
            ]);
        }

        $blocks = $book->blocks()
            ->where('status', '!=', 'deleted')
            ->whereNotNull('current_version_id')
            ->get(['id', 'block_uuid', 'text_plain']);
        abort_if($blocks->isEmpty(), 422, 'Save at least one text block before starting a translation batch.');
        $estimatedCredits = $blocks->sum(fn (BookBlock $block) => $credits->quote($validated['model'], str_word_count($block->text_plain ?: '')));

        $job = BookTranslationJob::query()->create([
            'book_id' => $book->id,
            'target_locale' => $targetLocale,
            'status' => 'queued',
            'provider_key' => 'at-openai',
            'model' => $validated['model'],
            'total_blocks' => $blocks->count(),
            'request_json' => [
                'source_locale' => $book->lang,
                'estimated_source_words' => $blocks->sum(fn (BookBlock $block) => str_word_count($block->text_plain ?: '')),
                'estimated_credits' => $estimatedCredits,
            ],
            'created_by' => auth()->id(),
        ]);
        $job->setRelation('book', $book);
        $credits->reserve($job, $estimatedCredits);

        ProcessBookTranslationJob::dispatch($job->id);

        return response()->json([
            'data' => [
                'job' => $this->serializeTranslationJob($job),
                'created' => true,
            ],
        ], 202);
    }

    public function cancelTranslationJob(string $keyBook, BookTranslationJob $job, TranslationCreditService $credits): JsonResponse
    {
        $book = Book::query()->where('key_book', $keyBook)->firstOrFail();
        abort_unless($job->book_id === $book->id, 404);
        abort_unless(in_array($job->status, ['queued', 'running'], true), 422, 'Only active translation batches can be cancelled.');

        $job->setRelation('book', $book);
        $remainingCredits = max(0, $job->reserved_credits - $job->consumed_credits - $job->released_credits);
        $credits->release($job, $remainingCredits, 'batch_cancelled');
        $job->forceFill([
            'status' => 'cancelled',
            'current_block_uuid' => null,
            'completed_at' => now(),
        ])->save();

        return response()->json(['data' => ['job' => $this->serializeTranslationJob($job)]]);
    }

    public function storeTranslationTerm(Request $request, string $keyBook): JsonResponse
    {
        $validated = $request->validate([
            'source_term' => ['required', 'string', 'max:180'],
            'target_term' => ['required', 'string', 'max:180'],
            'target_locale' => ['required', 'string', 'max:20'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);
        $book = Book::query()->where('key_book', $keyBook)->firstOrFail();

        $term = $book->translationTerms()->updateOrCreate([
            'source_term' => trim($validated['source_term']),
            'target_locale' => strtolower(trim($validated['target_locale'])),
        ], [
            'target_term' => trim($validated['target_term']),
            'notes' => filled($validated['notes'] ?? null) ? trim($validated['notes']) : null,
        ]);

        return response()->json(['data' => ['term' => $this->serializeTranslationTerm($term)]], 201);
    }

    public function deleteTranslationTerm(string $keyBook, BookTranslationTerm $term): JsonResponse
    {
        $book = Book::query()->where('key_book', $keyBook)->firstOrFail();
        abort_unless($term->book_id === $book->id, 404);
        $term->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }

    public function editor(string $keyBook): JsonResponse
    {
        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $blocks = $book->blocks()
            ->with('currentVersion')
            ->where('status', '!=', 'deleted')
            ->get();

        return response()->json([
            'data' => [
                'book' => [
                    'id' => $book->id,
                    'key_book' => $book->key_book,
                    'name' => $book->name,
                    'description' => $book->description,
                    'lang' => $book->lang,
                ],
                'document' => [
                    'type' => 'doc',
                    'content' => $blocks
                        ->map(fn (BookBlock $block) => $this->serializeEditorContent($block))
                        ->filter()
                        ->values()
                        ->all(),
                ],
                'blocks' => $blocks
                    ->map(fn (BookBlock $block) => $this->serializeEditorBlock($block))
                    ->values(),
            ],
        ]);
    }

    public function updateBlocks(
        Request $request,
        string $keyBook,
        BookBlockService $blocks,
    ): JsonResponse {
        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $validated = $request->validate([
            'source' => ['nullable', 'string', 'max:40'],
            'blocks' => ['present', 'array'],
            'blocks.*.block_uuid' => ['nullable', 'string', 'max:64'],
            'blocks.*.base_version_id' => ['nullable', 'integer'],
            'blocks.*.type' => ['required', 'string', 'max:40'],
            'blocks.*.sort_order' => ['required', 'integer', 'min:0'],
            'blocks.*.parent_block_id' => ['nullable', 'integer', 'exists:book_blocks,id'],
            'blocks.*.content_json' => ['nullable', 'array'],
            'blocks.*.text_plain' => ['nullable', 'string'],
            'blocks.*.diff_json' => ['nullable', 'array'],
            'deleted_block_uuids' => ['nullable', 'array'],
            'deleted_block_uuids.*' => ['string', 'max:64'],
        ]);

        $blockUuids = collect($validated['blocks'])
            ->pluck('block_uuid')
            ->filter()
            ->values();

        if ($blockUuids->duplicatesStrict()->isNotEmpty()) {
            return response()->json([
                'message' => 'Each editor block must have a unique block_uuid.',
                'errors' => [
                    'blocks' => ['Each editor block must have a unique block_uuid.'],
                ],
            ], 422);
        }

        try {
            [$saved, $deletedBlockUuids, $deletedCount] = DB::transaction(function () use ($validated, $book, $blocks) {
                $saved = [];

                foreach ($validated['blocks'] as $blockPayload) {
                    $result = $blocks->saveBlock($book, [
                        ...$blockPayload,
                        'source' => $validated['source'] ?? 'manual',
                    ], auth()->id());

                    $saved[] = [
                        ...$this->serializeEditorBlock($result['block']),
                        'created' => $result['created'],
                        'changed' => $result['changed'],
                    ];
                }

                $deletedBlockUuids = $validated['deleted_block_uuids'] ?? [];
                $deletedCount = $blocks->markBlocksDeleted($book, $deletedBlockUuids);

                return [$saved, $deletedBlockUuids, $deletedCount];
            });
        } catch (BookBlockVersionConflictException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
                'conflict' => [
                    'expected_version_id' => $exception->expectedVersionId,
                    'current_version_id' => $exception->currentVersionId,
                    'block_uuid' => $exception->blockUuid,
                ],
            ], 409);
        }

        return response()->json([
            'data' => [
                'blocks' => $saved,
                'deleted_block_uuids' => array_values($deletedBlockUuids),
                'deleted_count' => $deletedCount,
            ],
        ]);
    }

    public function blockVersions(string $keyBook, string $blockUuid): JsonResponse
    {
        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $block = $book->blocks()
            ->where('block_uuid', $blockUuid)
            ->firstOrFail();

        $versions = $block->versions()
            ->withCount([
                'reviews',
                'comments',
                'voiceAssignments',
                'audioSegments',
                'sourceTranslations',
                'aiChatThreads',
            ])
            ->orderByDesc('version_number')
            ->get();

        return response()->json([
            'data' => [
                'block' => $this->serializeEditorBlock($block),
                'versions' => $versions
                    ->map(fn ($version) => [
                        'id' => $version->id,
                        'version_number' => $version->version_number,
                        'source' => $version->source,
                        'text_plain' => $version->text_plain,
                        'content_hash' => $version->content_hash,
                        'created_at' => $version->created_at?->toISOString(),
                        'is_current' => $block->current_version_id === $version->id,
                        'activity' => [
                            'reviews' => $version->reviews_count,
                            'comments' => $version->comments_count,
                            'voices' => $version->voice_assignments_count,
                            'audio' => $version->audio_segments_count,
                            'translations' => $version->source_translations_count,
                            'ai_chats' => $version->ai_chat_threads_count,
                        ],
                        'has_activity' => (
                            $version->reviews_count
                            + $version->comments_count
                            + $version->voice_assignments_count
                            + $version->audio_segments_count
                            + $version->source_translations_count
                            + $version->ai_chat_threads_count
                        ) > 0,
                        'has_stale_activity' => $block->current_version_id !== $version->id && (
                            $version->reviews_count
                            + $version->comments_count
                            + $version->voice_assignments_count
                            + $version->audio_segments_count
                            + $version->source_translations_count
                            + $version->ai_chat_threads_count
                        ) > 0,
                        'explanation' => $this->latestVersionExplanation($version),
                    ])
                    ->values(),
            ],
        ]);
    }

    public function explainBlockVersion(
        Request $request,
        string $keyBook,
        string $blockUuid,
        EditorAiVersionService $versions,
    ): JsonResponse {
        $validated = $request->validate([
            'version_id' => ['required', 'integer'],
            'compare_version_id' => ['nullable', 'integer'],
            'provider_key' => ['nullable', 'string', 'max:80'],
            'model' => ['nullable', 'string', 'max:120'],
        ]);

        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $block = $book->blocks()
            ->with('currentVersion')
            ->where('block_uuid', $blockUuid)
            ->firstOrFail();

        $version = $block->versions()
            ->whereKey($validated['version_id'])
            ->firstOrFail();
        $compareVersion = isset($validated['compare_version_id'])
            ? $block->versions()->whereKey($validated['compare_version_id'])->firstOrFail()
            : null;

        $comparison = $this->versionComparison($block, $version, $compareVersion);

        if (! $comparison) {
            return response()->json([
                'message' => 'No comparison version is available.',
                'errors' => [
                    'version_id' => ['This block needs at least two versions before AI can explain changes.'],
                ],
            ], 422);
        }

        [$fromVersion, $toVersion] = $comparison;
        $message = $versions->explain(
            $book,
            $block,
            $fromVersion,
            $toVersion,
            $validated['provider_key'] ?? null,
            $validated['model'] ?? null,
        );

        $thread = AiChatThread::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $block->id,
            'book_block_version_id' => $version->id,
            'scope' => 'versions',
            'block_uuid' => $block->block_uuid,
            'title' => $message['metadata']['message'],
            'created_by' => auth()->id(),
        ]);

        AiChatMessage::query()->create([
            'ai_chat_thread_id' => $thread->id,
            'role' => 'assistant',
            'content' => $message['answer'],
            'source' => $message['source'],
            'provider_key' => $message['provider_key'],
            'model' => $message['model'],
            'metadata_json' => $message['metadata'],
            'created_by' => auth()->id(),
        ]);

        return response()->json([
            'data' => [
                'thread' => $this->serializeChatThread($thread->refresh()),
                'explanation' => $this->serializeVersionExplanation($thread),
            ],
        ], 201);
    }

    public function restoreBlockVersion(
        Request $request,
        string $keyBook,
        string $blockUuid,
        BookBlockService $blocks,
    ): JsonResponse {
        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $block = $book->blocks()
            ->where('block_uuid', $blockUuid)
            ->firstOrFail();

        $validated = $request->validate([
            'version_id' => ['required', 'integer'],
        ]);

        $version = $block->versions()
            ->whereKey($validated['version_id'])
            ->firstOrFail();

        $result = $blocks->restoreVersion($book, $block, $version, auth()->id());

        return response()->json([
            'data' => [
                'block' => $this->serializeEditorBlock($result['block']),
                'version' => [
                    'id' => $result['version']->id,
                    'version_number' => $result['version']->version_number,
                    'source' => $result['version']->source,
                    'text_plain' => $result['version']->text_plain,
                    'content_hash' => $result['version']->content_hash,
                    'created_at' => $result['version']->created_at?->toISOString(),
                    'is_current' => true,
                ],
                'restored_from' => [
                    'id' => $result['restored_from']->id,
                    'version_number' => $result['restored_from']->version_number,
                ],
                'changed' => $result['changed'],
            ],
        ], $result['changed'] ? 201 : 200);
    }

    public function blockReviews(string $keyBook, string $blockUuid): JsonResponse
    {
        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $block = $book->blocks()
            ->where('block_uuid', $blockUuid)
            ->firstOrFail();

        $reviews = $block->reviews()
            ->with('blockVersion:id,version_number')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get();

        return response()->json([
            'data' => [
                'block' => $this->serializeEditorBlock($block),
                'reviews' => $reviews
                    ->map(fn (BookBlockReview $review) => $this->serializeBlockReview($review, $block))
                    ->values(),
            ],
        ]);
    }

    public function blockComments(string $keyBook, string $blockUuid): JsonResponse
    {
        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $block = $book->blocks()
            ->with('currentVersion')
            ->where('block_uuid', $blockUuid)
            ->firstOrFail();

        $comments = $block->comments()
            ->with('blockVersion:id,version_number')
            ->orderByRaw("case when status = 'open' then 0 else 1 end")
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get();

        return response()->json([
            'data' => [
                'block' => $this->serializeEditorBlock($block),
                'comments' => $comments
                    ->map(fn (BookBlockComment $comment) => $this->serializeBlockComment($comment, $block))
                    ->values(),
            ],
        ]);
    }

    public function bookActivity(Request $request, string $keyBook): JsonResponse
    {
        $validated = $request->validate([
            'limit' => ['nullable', 'integer', 'min:1', 'max:300'],
        ]);

        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $limit = (int) ($validated['limit'] ?? 180);
        $items = collect();

        $blocks = $book->blocks()
            ->with('currentVersion')
            ->where('status', '!=', 'deleted')
            ->withCount([
                'comments as open_comments_count' => fn ($query) => $query
                    ->where('status', 'open')
                    ->whereColumn('book_block_comments.book_block_version_id', 'book_blocks.current_version_id'),
                'comments as stale_comments_count' => fn ($query) => $query
                    ->whereColumn('book_block_comments.book_block_version_id', '!=', 'book_blocks.current_version_id'),
                'reviews as draft_reviews_count' => fn ($query) => $query
                    ->where('status', 'draft')
                    ->whereColumn('book_block_reviews.book_block_version_id', 'book_blocks.current_version_id'),
                'reviews as stale_reviews_count' => fn ($query) => $query
                    ->whereColumn('book_block_reviews.book_block_version_id', '!=', 'book_blocks.current_version_id'),
                'translations as draft_translations_count' => fn ($query) => $query
                    ->where('status', 'draft')
                    ->whereColumn('book_block_translations.source_book_block_version_id', 'book_blocks.current_version_id'),
                'translations as stale_translations_count' => fn ($query) => $query
                    ->whereColumn('book_block_translations.source_book_block_version_id', '!=', 'book_blocks.current_version_id'),
                'voiceAssignments as current_voice_assignments_count' => fn ($query) => $query
                    ->whereColumn('book_block_voice_assignments.book_block_version_id', 'book_blocks.current_version_id'),
                'audioSegments as current_audio_segments_count' => fn ($query) => $query
                    ->whereColumn('book_audio_segments.book_block_version_id', 'book_blocks.current_version_id'),
            ])
            ->get();

        foreach ($blocks as $block) {
            $preview = Str::of($block->text_plain ?: $block->type)->squish()->limit(140)->toString();
            $base = [
                'block_uuid' => $block->block_uuid,
                'block_type' => $block->type,
                'block_sort_order' => $block->sort_order,
                'block_text_plain' => $block->text_plain,
                'block_version_id' => $block->current_version_id,
                'version_number' => $block->currentVersion?->version_number,
                'preview' => $preview,
            ];

            if ($block->open_comments_count) {
                $items->push([
                    ...$base,
                    'id' => "comments-open-{$block->block_uuid}",
                    'type' => 'comments',
                    'tool' => 'comments',
                    'severity' => 'review',
                    'title' => 'Comments need review',
                    'count' => (int) $block->open_comments_count,
                    'description' => "{$block->open_comments_count} open comment".($block->open_comments_count === 1 ? '' : 's').' need review.',
                ]);
            }

            if ($block->stale_comments_count) {
                $items->push([
                    ...$base,
                    'id' => "comments-stale-{$block->block_uuid}",
                    'type' => 'stale_comments',
                    'tool' => 'comments',
                    'severity' => 'stale',
                    'title' => 'Comments may be outdated',
                    'count' => (int) $block->stale_comments_count,
                    'description' => 'Comments are linked to older text and may need reanchoring.',
                ]);
            }

            if ($block->draft_reviews_count) {
                $singleReview = $block->draft_reviews_count === 1
                    ? $block->reviews()
                        ->where('status', 'draft')
                        ->where('book_block_version_id', $block->current_version_id)
                        ->latest('id')
                        ->first()
                    : null;

                $items->push([
                    ...$base,
                    'id' => "reviews-draft-{$block->block_uuid}",
                    'type' => 'draft_reviews',
                    'tool' => 'correct',
                    'severity' => 'action',
                    'title' => 'Correction draft ready',
                    'count' => (int) $block->draft_reviews_count,
                    'description' => 'AI corrections are waiting for apply or reject.',
                    'action_target' => $singleReview ? [
                        'id' => $singleReview->id,
                        'status' => $singleReview->status,
                        'suggested_text' => $singleReview->suggested_text,
                        'original_text' => $singleReview->original_text,
                        'is_current_version' => true,
                    ] : null,
                ]);
            }

            if ($block->stale_reviews_count) {
                $items->push([
                    ...$base,
                    'id' => "reviews-stale-{$block->block_uuid}",
                    'type' => 'stale_reviews',
                    'tool' => 'versions',
                    'severity' => 'stale',
                    'title' => 'Correction linked to older text',
                    'count' => (int) $block->stale_reviews_count,
                    'description' => 'Corrections are linked to an older block version.',
                ]);
            }

            if ($block->draft_translations_count) {
                $singleTranslation = $block->draft_translations_count === 1
                    ? $block->translations()
                        ->where('status', 'draft')
                        ->where('source_book_block_version_id', $block->current_version_id)
                        ->latest('id')
                        ->first()
                    : null;

                $items->push([
                    ...$base,
                    'id' => "translations-draft-{$block->block_uuid}",
                    'type' => 'draft_translations',
                    'tool' => 'translate',
                    'severity' => 'action',
                    'title' => 'Translation draft ready',
                    'count' => (int) $block->draft_translations_count,
                    'description' => 'Translations are waiting for approval or rejection.',
                    'action_target' => $singleTranslation ? [
                        'id' => $singleTranslation->id,
                        'status' => $singleTranslation->status,
                        'target_locale' => $singleTranslation->target_locale,
                        'translated_text' => $singleTranslation->translated_text,
                        'is_current_version' => true,
                    ] : null,
                ]);
            }

            if ($block->stale_translations_count) {
                $items->push([
                    ...$base,
                    'id' => "translations-stale-{$block->block_uuid}",
                    'type' => 'stale_translations',
                    'tool' => 'versions',
                    'severity' => 'stale',
                    'title' => 'Translation may be outdated',
                    'count' => (int) $block->stale_translations_count,
                    'description' => 'Translations are linked to older source text.',
                ]);
            }

            if ($block->current_voice_assignments_count && ! $block->current_audio_segments_count) {
                $items->push([
                    ...$base,
                    'id' => "audio-missing-{$block->block_uuid}",
                    'type' => 'audio_missing',
                    'tool' => 'audio',
                    'severity' => 'action',
                    'title' => 'Audio not generated',
                    'count' => 1,
                    'description' => 'A voice is assigned but the current version has no audio segment.',
                ]);
            }
        }

        $severityOrder = ['action' => 0, 'review' => 1, 'stale' => 2];
        $typeOrder = [
            'draft_reviews' => 0,
            'draft_translations' => 1,
            'audio_missing' => 2,
            'comments' => 3,
            'stale_comments' => 4,
            'stale_reviews' => 5,
            'stale_translations' => 6,
        ];
        $orderedItems = $items
            ->sort(function (array $a, array $b) use ($severityOrder, $typeOrder) {
                $severityComparison = ($severityOrder[$a['severity']] ?? 9) <=> ($severityOrder[$b['severity']] ?? 9);
                if ($severityComparison !== 0) {
                    return $severityComparison;
                }

                $blockComparison = $a['block_sort_order'] <=> $b['block_sort_order'];
                if ($blockComparison !== 0) {
                    return $blockComparison;
                }

                return ($typeOrder[$a['type']] ?? 99) <=> ($typeOrder[$b['type']] ?? 99);
            })
            ->take($limit)
            ->values();

        return response()->json([
            'data' => [
                'items' => $orderedItems,
                'summary' => [
                    'all' => $items->count(),
                    'action' => $items->where('severity', 'action')->count(),
                    'review' => $items->where('severity', 'review')->count(),
                    'stale' => $items->where('severity', 'stale')->count(),
                ],
            ],
        ]);
    }

    public function bookComments(Request $request, string $keyBook): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['nullable', 'string', 'in:open,resolved,stale,all'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:250'],
        ]);

        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $status = $validated['status'] ?? 'all';
        $limit = (int) ($validated['limit'] ?? 150);

        $comments = BookBlockComment::query()
            ->with([
                'block' => fn ($query) => $query->with('currentVersion'),
                'blockVersion:id,version_number',
            ])
            ->join('book_blocks', 'book_block_comments.book_block_id', '=', 'book_blocks.id')
            ->where('book_block_comments.book_id', $book->id)
            ->where('book_blocks.status', '!=', 'deleted')
            ->when($status === 'open', function ($query) {
                $query
                    ->where('book_block_comments.status', 'open')
                    ->whereColumn('book_block_comments.book_block_version_id', 'book_blocks.current_version_id');
            })
            ->when($status === 'resolved', fn ($query) => $query->where('book_block_comments.status', 'resolved'))
            ->when($status === 'stale', fn ($query) => $query->whereColumn('book_block_comments.book_block_version_id', '!=', 'book_blocks.current_version_id'))
            ->orderByRaw("case when book_block_comments.status = 'open' then 0 else 1 end")
            ->orderBy('book_blocks.sort_order')
            ->orderByDesc('book_block_comments.created_at')
            ->orderByDesc('book_block_comments.id')
            ->limit($limit)
            ->get('book_block_comments.*');

        return response()->json([
            'data' => [
                'comments' => $comments
                    ->filter(fn (BookBlockComment $comment) => $comment->block)
                    ->map(fn (BookBlockComment $comment) => $this->serializeBlockComment($comment, $comment->block))
                    ->values(),
            ],
        ]);
    }

    public function blockCommentSummary(string $keyBook): JsonResponse
    {
        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $summaries = BookBlockComment::query()
            ->join('book_blocks', 'book_block_comments.book_block_id', '=', 'book_blocks.id')
            ->where('book_block_comments.book_id', $book->id)
            ->where('book_blocks.status', '!=', 'deleted')
            ->groupBy('book_block_comments.block_uuid', 'book_blocks.current_version_id')
            ->orderBy('block_sort_order')
            ->get([
                'book_block_comments.block_uuid',
                DB::raw('min(book_blocks.sort_order) as block_sort_order'),
                DB::raw('count(*) as all_count'),
                DB::raw("sum(case when book_block_comments.status = 'open' and book_block_comments.book_block_version_id = book_blocks.current_version_id then 1 else 0 end) as open_count"),
                DB::raw("sum(case when book_block_comments.status = 'resolved' then 1 else 0 end) as resolved_count"),
                DB::raw('sum(case when book_block_comments.book_block_version_id <> book_blocks.current_version_id then 1 else 0 end) as stale_count'),
            ])
            ->map(fn ($summary) => [
                'block_uuid' => $summary->block_uuid,
                'all' => (int) $summary->all_count,
                'open' => (int) $summary->open_count,
                'resolved' => (int) $summary->resolved_count,
                'stale' => (int) $summary->stale_count,
            ])
            ->values();

        return response()->json([
            'data' => [
                'summaries' => $summaries,
            ],
        ]);
    }

    public function voiceProfiles(string $keyBook): JsonResponse
    {
        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        return response()->json([
            'data' => [
                'profiles' => $book->voiceProfiles()
                    ->orderByRaw("case when role = 'narrator' then 0 else 1 end")
                    ->orderBy('name')
                    ->get()
                    ->map(fn (BookVoiceProfile $profile) => $this->serializeVoiceProfile($profile))
                    ->values(),
            ],
        ]);
    }

    public function storeVoiceProfile(Request $request, string $keyBook): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'role' => ['nullable', 'string', 'in:narrator,character,ambient,system'],
            'voice_provider' => ['nullable', 'string', 'max:80'],
            'voice_id' => ['nullable', 'string', 'max:160'],
            'language' => ['nullable', 'string', 'max:20'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $profile = BookVoiceProfile::query()->create([
            'book_id' => $book->id,
            'name' => trim($validated['name']),
            'role' => $validated['role'] ?? 'character',
            'voice_provider' => $validated['voice_provider'] ?? null,
            'voice_id' => $validated['voice_id'] ?? null,
            'language' => $validated['language'] ?? $book->lang,
            'notes' => $validated['notes'] ?? null,
            'created_by' => auth()->id(),
        ]);

        return response()->json([
            'data' => [
                'profile' => $this->serializeVoiceProfile($profile),
                'created' => true,
            ],
        ], 201);
    }

    public function blockVoiceAssignment(string $keyBook, string $blockUuid): JsonResponse
    {
        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $block = $book->blocks()
            ->with('currentVersion')
            ->where('block_uuid', $blockUuid)
            ->firstOrFail();

        $assignment = $block->voiceAssignments()
            ->with(['voiceProfile', 'blockVersion:id,version_number'])
            ->where('book_block_version_id', $block->current_version_id)
            ->latest('id')
            ->first();

        return response()->json([
            'data' => [
                'block' => $this->serializeEditorBlock($block),
                'assignment' => $assignment ? $this->serializeVoiceAssignment($assignment, $block) : null,
            ],
        ]);
    }

    public function blockAudio(string $keyBook, string $blockUuid): JsonResponse
    {
        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $block = $book->blocks()
            ->with('currentVersion')
            ->where('block_uuid', $blockUuid)
            ->firstOrFail();

        $assignment = $block->voiceAssignments()
            ->with(['voiceProfile', 'blockVersion:id,version_number'])
            ->where('book_block_version_id', $block->current_version_id)
            ->latest('id')
            ->first();

        $segments = $block->audioSegments()
            ->with(['voiceProfile', 'blockVersion:id,version_number', 'audioJob:id,status'])
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get();
        $jobs = $block->audioJobs()
            ->with(['voiceProfile', 'segments' => fn ($query) => $query->orderBy('segment_index')])
            ->where('status', 'completed')->latest('created_at')->latest('id')->get();
        $usedJobIds = $book->audioTimelineItems()->whereNotNull('book_audio_job_id')->pluck('book_audio_job_id')->flip();
        $usedSegmentIds = $book->audioTimelineItems()->whereNotNull('book_audio_segment_id')->pluck('book_audio_segment_id')->flip();

        return response()->json([
            'data' => [
                'block' => $this->serializeEditorBlock($block),
                'assignment' => $assignment ? $this->serializeVoiceAssignment($assignment, $block) : null,
                'segments' => $segments
                    ->map(fn (BookAudioSegment $segment) => $this->serializeAudioSegment($segment, $block))
                    ->values(),
                'groups' => $jobs->map(fn (BookAudioJob $job) => [
                    'id' => $job->id, 'label' => $job->voiceProfile?->name ?: 'Narration group',
                    'created_at' => $job->created_at?->toISOString(),
                    'duration_ms' => $job->segments->sum(fn (BookAudioSegment $segment) => (int) $segment->duration_ms + (int) $segment->pause_after_ms),
                    'in_timeline' => $usedJobIds->has($job->id) || $job->segments->contains(fn (BookAudioSegment $segment) => $usedSegmentIds->has($segment->id)),
                    'segments' => $job->segments->map(fn (BookAudioSegment $segment) => $this->serializeAudioSegment($segment, $block))->values(),
                ])->values(),
            ],
        ]);
    }

    public function audioTimeline(string $keyBook): JsonResponse
    {
        $book = Book::query()->where('key_book', $keyBook)->firstOrFail();
        $relations = [
            'audioSegment:id,block_uuid,audio_path,duration_ms,status,metadata_json',
            'librarySample:id,audio_library_voice_id,audio_path,duration_ms,original_name',
            'mediaAsset:id,account_id,audio_path,duration_ms,original_name',
            'audioJob.segments:id,book_audio_job_id,audio_path,duration_ms,pause_after_ms,segment_index,text_plain,source_start,source_end,metadata_json',
            'timelineChildren.audioSegment:id,block_uuid,audio_path,duration_ms,status,metadata_json',
            'timelineChildren.librarySample:id,audio_library_voice_id,audio_path,duration_ms,original_name',
            'timelineChildren.mediaAsset:id,account_id,audio_path,duration_ms,original_name',
        ];
        $audioPath = static fn (BookAudioTimelineItem $item): ?string => $item->audioSegment?->audio_path
            ?? ($item->mediaAsset ? route('dashboard.api.audio-media.stream', $item->mediaAsset) : ($item->librarySample ? route('dashboard.api.audio-library.samples.stream', $item->librarySample) : null));
        $items = $book->audioTimelineItems()
            // Compound children are represented by their persisted master.
            // The original clip rows remain intact and are returned inside it.
            ->whereNull('parent_timeline_item_id')
            ->with($relations)
            ->orderBy('track')
            ->orderBy('sort_order')
            ->get()
            ->map(function (BookAudioTimelineItem $item) use ($audioPath): array {
                $data = $item->toArray();
                $data['audio_path'] = $audioPath($item);
                $data['block_uuid'] = $item->audioJob?->block_uuid ?? $item->audioSegment?->block_uuid;
                $data['group_segments'] = $item->is_group && $item->audioJob
                    ? $item->audioJob->segments->sortBy('segment_index')->values()->map(fn (BookAudioSegment $segment) => [
                        'id' => $segment->id, 'audio_path' => $segment->audio_path,
                        'duration_ms' => $segment->duration_ms, 'pause_after_ms' => $segment->pause_after_ms,
                        'text_plain' => $segment->text_plain, 'source_start' => $segment->source_start, 'source_end' => $segment->source_end,
                        'word_timings' => $segment->metadata_json['word_timings'] ?? [],
                    ])->all()
                    : ($item->is_group && $item->timelineChildren->isNotEmpty()
                        ? $item->timelineChildren->sortBy('start_ms')->values()->map(fn (BookAudioTimelineItem $child) => [
                            'id' => "timeline-{$child->id}",
                            'audio_path' => $audioPath($child),
                            'duration_ms' => $child->duration_ms,
                            'timeline_offset_ms' => max(0, (int) $child->start_ms - (int) $item->start_ms),
                            'media_offset_ms' => $child->trim_start_ms,
                            'volume' => $child->volume,
                            'muted' => $child->muted,
                            'fade_in_ms' => $child->fade_in_ms,
                            'fade_out_ms' => $child->fade_out_ms,
                            'text_plain' => $child->label,
                            'word_timings' => $child->audioSegment?->metadata_json['word_timings'] ?? [],
                        ])->all()
                        : null);
                $data['is_compound_group'] = $item->is_group && ! $item->book_audio_job_id && $item->timelineChildren->isNotEmpty();
                unset($data['audio_segment']);
                unset($data['library_sample']);
                unset($data['media_asset']);
                unset($data['audio_job']);
                unset($data['timeline_children']);

                return $data;
            });

        return response()->json(['data' => ['items' => $items]]);
    }

    public function saveAudioTimeline(Request $request, string $keyBook): JsonResponse
    {
        $validated = $request->validate(['items' => ['required', 'array', 'max:300'], 'items.*.id' => ['nullable', 'integer'], 'items.*.track' => ['required', 'in:voice,music,fx'], 'items.*.lane' => ['nullable', 'integer', 'min:0', 'max:40'], 'items.*.label' => ['required', 'string', 'max:160'], 'items.*.start_ms' => ['required', 'integer', 'min:0'], 'items.*.duration_ms' => ['required', 'integer', 'min:100'], 'items.*.trim_start_ms' => ['nullable', 'integer', 'min:0'], 'items.*.trim_end_ms' => ['nullable', 'integer', 'min:0'], 'items.*.fade_in_ms' => ['nullable', 'integer', 'min:0'], 'items.*.fade_out_ms' => ['nullable', 'integer', 'min:0'], 'items.*.volume' => ['nullable', 'integer', 'min:0', 'max:100'], 'items.*.muted' => ['nullable', 'boolean'], 'items.*.is_group' => ['nullable', 'boolean'], 'items.*.book_audio_segment_id' => ['nullable', 'integer'], 'items.*.audio_library_voice_sample_id' => ['nullable', 'integer'], 'items.*.audio_media_asset_id' => ['nullable', 'integer'], 'items.*.book_audio_job_id' => ['nullable', 'integer']]);
        $book = Book::query()->where('key_book', $keyBook)->firstOrFail();
        $sampleIds = collect($validated['items'])->pluck('audio_library_voice_sample_id')->filter()->map(fn ($id) => (int) $id)->unique()->values();
        abort_unless($sampleIds->isEmpty() || AudioLibraryVoiceSample::query()->whereIn('id', $sampleIds)->whereHas('voice', fn ($query) => $query->where('account_id', auth()->id()))->count() === $sampleIds->count(), 422);
        $mediaIds = collect($validated['items'])->pluck('audio_media_asset_id')->filter()->map(fn ($id) => (int) $id)->unique()->values();
        abort_unless($mediaIds->isEmpty() || AudioMediaAsset::query()->whereIn('id', $mediaIds)->where('account_id', auth()->id())->count() === $mediaIds->count(), 422);
        DB::transaction(function () use ($book, $validated): void {
            $submittedIds = collect($validated['items'])->pluck('id')->filter()->map(fn ($id) => (int) $id)->values();
            // Nested compound children are managed by their group/ungroup
            // endpoints and must not disappear when the client saves masters.
            $existing = $book->audioTimelineItems()->whereNull('parent_timeline_item_id');
            $submittedIds->isEmpty() ? $existing->delete() : $existing->whereNotIn('id', $submittedIds)->delete();

            foreach ($validated['items'] as $index => $item) {
                $record = isset($item['id']) ? $book->audioTimelineItems()->whereKey($item['id'])->firstOrFail() : new BookAudioTimelineItem(['book_id' => $book->id]);
                $record->fill([...$item, 'sort_order' => $index]);
                $record->save();
            }
        });

        return $this->audioTimeline($keyBook);
    }

    public function deleteAudioTimelineItem(string $keyBook, BookAudioTimelineItem $timelineItem): JsonResponse
    {
        $book = Book::query()->where('key_book', $keyBook)->firstOrFail();
        abort_unless($timelineItem->book_id === $book->id, 404);

        // The timeline entry is removed, while the generated source segment and
        // its audio file remain available for reuse elsewhere in the audiobook.
        $timelineItem->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }

    public function insertAudioGroupTimeline(Request $request, string $keyBook, string $blockUuid, BookAudioJob $job): JsonResponse
    {
        $validated = $request->validate(['start_ms' => ['nullable', 'integer', 'min:0', 'max:86400000'], 'lane' => ['nullable', 'integer', 'min:0', 'max:40']]);
        $book = Book::query()->where('key_book', $keyBook)->firstOrFail();
        abort_unless($job->book_id === $book->id && $job->block_uuid === $blockUuid && $job->status === 'completed', 404);
        $segments = $job->segments()->orderBy('segment_index')->get();
        abort_if($segments->isEmpty(), 422, 'This audio group has no completed clips.');
        $duration = $segments->sum(fn (BookAudioSegment $segment) => (int) $segment->duration_ms + (int) $segment->pause_after_ms);
        $start = (int) ($validated['start_ms'] ?? 0);
        $item = BookAudioTimelineItem::query()->create([
            'book_id' => $book->id, 'book_audio_segment_id' => $segments->first()->id,
            'book_audio_job_id' => $job->id, 'is_group' => true, 'track' => 'voice',
            'lane' => (int) ($validated['lane'] ?? 0), 'label' => $job->voiceProfile?->name ?: 'Narration group', 'start_ms' => $start,
            'duration_ms' => $duration, 'sort_order' => $book->audioTimelineItems()->count(),
        ]);
        return response()->json(['data' => ['item_id' => $item->id]], 201);
    }

    public function deleteAudioGroup(string $keyBook, string $blockUuid, BookAudioJob $job): JsonResponse
    {
        $book = Book::query()->where('key_book', $keyBook)->firstOrFail();
        abort_unless($job->book_id === $book->id && $job->block_uuid === $blockUuid, 404);

        $segments = $job->segments()->get();
        $isUsed = $book->audioTimelineItems()
            ->where(function ($query) use ($job, $segments) {
                $query->where('book_audio_job_id', $job->id);
                if ($segments->isNotEmpty()) {
                    $query->orWhereIn('book_audio_segment_id', $segments->pluck('id'));
                }
            })
            ->exists();
        abort_if($isUsed, 422, 'Remove this audio from the timeline before deleting its master group.');

        foreach ($segments as $segment) {
            if ($segment->audio_path && ! str_starts_with($segment->audio_path, 'mock://')) {
                Storage::disk('public')->delete($segment->audio_path);
            }
        }
        $job->segments()->delete();
        $job->delete();

        return response()->json(['data' => ['deleted' => true]]);
    }

    public function groupAudioTimelineItems(Request $request, string $keyBook): JsonResponse
    {
        $validated = $request->validate([
            'item_ids' => ['required', 'array', 'min:2', 'max:40'],
            'item_ids.*' => ['integer', 'distinct'],
        ]);
        $book = Book::query()->where('key_book', $keyBook)->firstOrFail();
        $items = $book->audioTimelineItems()
            ->whereIn('id', $validated['item_ids'])
            ->whereNull('parent_timeline_item_id')
            ->orderBy('start_ms')
            ->get();
        abort_unless($items->count() === count($validated['item_ids']), 422, 'One or more selected clips are no longer available.');
        abort_if($items->contains(fn (BookAudioTimelineItem $item) => $item->is_group), 422, 'Ungroup master clips before creating a new compound clip.');

        $track = $items->first()->track;
        $lane = $items->first()->lane;
        abort_unless($items->every(fn (BookAudioTimelineItem $item) => $item->track === $track && (int) $item->lane === (int) $lane), 422, 'Compound clips must use the same channel and lane.');

        $start = $items->min('start_ms');
        $end = $items->max(fn (BookAudioTimelineItem $item) => (int) $item->start_ms + (int) $item->duration_ms);
        $master = DB::transaction(function () use ($book, $items, $track, $lane, $start, $end): BookAudioTimelineItem {
            $master = BookAudioTimelineItem::query()->create([
                'book_id' => $book->id,
                'is_group' => true,
                'track' => $track,
                'lane' => $lane,
                'label' => "{$items->count()} clips group",
                'start_ms' => $start,
                'duration_ms' => max(100, $end - $start),
                'volume' => 100,
                'sort_order' => $items->min('sort_order'),
            ]);
            BookAudioTimelineItem::query()->whereIn('id', $items->pluck('id'))->update(['parent_timeline_item_id' => $master->id]);

            return $master;
        });

        return response()->json(['data' => ['master_id' => $master->id]], 201);
    }

    public function ungroupAudioTimelineItem(string $keyBook, BookAudioTimelineItem $timelineItem): JsonResponse
    {
        $book = Book::query()->where('key_book', $keyBook)->firstOrFail();
        abort_unless($timelineItem->book_id === $book->id && $timelineItem->is_group, 422);

        if (! $timelineItem->book_audio_job_id) {
            $children = $timelineItem->timelineChildren()->get();
            abort_if($children->isEmpty(), 422, 'This compound clip has no children to ungroup.');
            DB::transaction(function () use ($timelineItem): void {
                $timelineItem->timelineChildren()->update(['parent_timeline_item_id' => null]);
                $timelineItem->delete();
            });

            return $this->audioTimeline($keyBook);
        }

        $segments = $timelineItem->audioJob?->segments()->orderBy('segment_index')->get() ?? collect();
        abort_if($segments->isEmpty(), 422, 'This group has no clips to ungroup.');

        // A grouped generation is a non-destructive master. Ungrouping must
        // keep its current timeline edit: portions trimmed from the master do
        // not come back, and pauses remain at their original positions.
        $sourceDuration = $segments->sum(fn (BookAudioSegment $segment) => (int) $segment->duration_ms + (int) $segment->pause_after_ms);
        $visibleStart = min(max(0, (int) $timelineItem->trim_start_ms), $sourceDuration);
        $visibleEnd = max($visibleStart, $sourceDuration - max(0, (int) $timelineItem->trim_end_ms));
        abort_if($visibleEnd <= $visibleStart, 422, 'The visible portion of this group is empty.');

        $created = [];
        $offset = 0;
        foreach ($segments as $segment) {
            $segmentStart = $offset;
            $segmentEnd = $segmentStart + (int) $segment->duration_ms;
            $partStart = max($visibleStart, $segmentStart);
            $partEnd = min($visibleEnd, $segmentEnd);

            if ($partEnd > $partStart) {
                $created[] = [
                    'segment' => $segment,
                    'start_ms' => (int) $timelineItem->start_ms + ($partStart - $visibleStart),
                    'duration_ms' => $partEnd - $partStart,
                    'trim_start_ms' => $partStart - $segmentStart,
                    'trim_end_ms' => $segmentEnd - $partEnd,
                ];
            }
            $offset = $segmentEnd + (int) $segment->pause_after_ms;
        }
        abort_if(empty($created), 422, 'The visible portion of this group contains no audio clips.');

        DB::transaction(function () use ($book, $timelineItem, $created): void {
            $lastIndex = count($created) - 1;
            foreach ($created as $index => $part) {
                /** @var BookAudioSegment $segment */
                $segment = $part['segment'];
                BookAudioTimelineItem::query()->create([
                    'book_id' => $book->id,
                    'book_audio_segment_id' => $segment->id,
                    'book_audio_job_id' => $timelineItem->book_audio_job_id,
                    'track' => $timelineItem->track,
                    'lane' => $timelineItem->lane,
                    'label' => $segment->text_plain,
                    'start_ms' => $part['start_ms'],
                    'duration_ms' => $part['duration_ms'],
                    'trim_start_ms' => $part['trim_start_ms'],
                    'trim_end_ms' => $part['trim_end_ms'],
                    'fade_in_ms' => $index === 0 ? min((int) $timelineItem->fade_in_ms, (int) floor($part['duration_ms'] / 2)) : 0,
                    'fade_out_ms' => $index === $lastIndex ? min((int) $timelineItem->fade_out_ms, (int) floor($part['duration_ms'] / 2)) : 0,
                    'volume' => $timelineItem->volume,
                    'muted' => $timelineItem->muted,
                    'sort_order' => $timelineItem->sort_order + $index,
                ]);
            }
            $timelineItem->delete();
        });

        return $this->audioTimeline($keyBook);
    }

    public function blockTranslations(string $keyBook, string $blockUuid): JsonResponse
    {
        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $block = $book->blocks()
            ->with('currentVersion')
            ->where('block_uuid', $blockUuid)
            ->firstOrFail();

        $translations = $block->translations()
            ->with('sourceBlockVersion:id,version_number')
            ->orderByRaw("case when status = 'draft' then 0 else 1 end")
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get();

        return response()->json([
            'data' => [
                'block' => $this->serializeEditorBlock($block),
                'translations' => $translations
                    ->map(fn (BookBlockTranslation $translation) => $this->serializeBlockTranslation($translation, $block))
                    ->values(),
            ],
        ]);
    }

    public function aiChatThread(Request $request, string $keyBook): JsonResponse
    {
        $validated = $request->validate([
            'scope' => ['nullable', 'string', 'in:block,book'],
            'block_uuid' => ['nullable', 'string', 'max:64'],
        ]);

        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $block = $this->chatBlock($book, $validated['scope'] ?? 'block', $validated['block_uuid'] ?? null);
        $thread = $this->findChatThread($book, $validated['scope'] ?? 'block', $block);

        return response()->json([
            'data' => [
                'thread' => $thread ? $this->serializeChatThread($thread) : null,
                'messages' => $thread ? $this->serializeChatMessages($thread) : [],
            ],
        ]);
    }

    public function aiChat(Request $request, string $keyBook, EditorAiChatService $chat): JsonResponse
    {
        $validated = $request->validate([
            'scope' => ['nullable', 'string', 'in:block,book'],
            'block_uuid' => ['nullable', 'string', 'max:64'],
            'message' => ['required', 'string', 'max:5000'],
            'provider_key' => ['nullable', 'string', 'max:80'],
            'model' => ['nullable', 'string', 'max:120'],
        ]);

        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();
        $scope = $validated['scope'] ?? 'block';
        $block = $this->chatBlock($book, $scope, $validated['block_uuid'] ?? null);
        $thread = $this->firstOrCreateChatThread($book, $scope, $block, $validated['message']);

        AiChatMessage::query()->create([
            'ai_chat_thread_id' => $thread->id,
            'role' => 'user',
            'content' => trim($validated['message']),
            'created_by' => auth()->id(),
        ]);

        $message = $chat->ask($book, [
            ...$validated,
            'block_uuid' => $block?->block_uuid,
        ]);

        AiChatMessage::query()->create([
            'ai_chat_thread_id' => $thread->id,
            'role' => 'assistant',
            'content' => $message['answer'],
            'source' => $message['source'],
            'provider_key' => $message['provider_key'],
            'model' => $message['model'],
            'metadata_json' => $message['metadata'],
            'created_by' => auth()->id(),
        ]);

        return response()->json([
            'data' => [
                'thread' => $this->serializeChatThread($thread->refresh()),
                'message' => $message,
                'messages' => $this->serializeChatMessages($thread),
            ],
        ]);
    }

    public function storeBlockComment(Request $request, string $keyBook, string $blockUuid): JsonResponse
    {
        $validated = $request->validate([
            'body' => ['required', 'string', 'max:5000'],
            'book_block_version_id' => ['nullable', 'integer'],
            'metadata_json' => ['nullable', 'array'],
        ]);

        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $block = $book->blocks()
            ->with('currentVersion')
            ->where('block_uuid', $blockUuid)
            ->firstOrFail();

        if (! $block->currentVersion) {
            return response()->json([
                'message' => 'The selected block has no saved version to comment.',
                'errors' => [
                    'block' => ['Save the block before adding a comment.'],
                ],
            ], 422);
        }

        $commentVersion = isset($validated['book_block_version_id'])
            ? $block->versions()->whereKey($validated['book_block_version_id'])->firstOrFail()
            : $block->currentVersion;

        $comment = BookBlockComment::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $block->id,
            'book_block_version_id' => $commentVersion->id,
            'block_uuid' => $block->block_uuid,
            'status' => 'open',
            'body' => trim($validated['body']),
            'metadata_json' => $validated['metadata_json'] ?? null,
            'created_by' => auth()->id(),
        ]);

        return response()->json([
            'data' => [
                'comment' => $this->serializeBlockComment($comment->load('blockVersion:id,version_number'), $block),
                'created' => true,
            ],
        ], 201);
    }

    public function updateBlockComment(
        Request $request,
        string $keyBook,
        string $blockUuid,
        BookBlockComment $comment,
    ): JsonResponse {
        $validated = $request->validate([
            'status' => ['nullable', 'string', 'in:open,resolved'],
            'book_block_version_id' => ['nullable', 'integer'],
            'metadata_json' => ['nullable', 'array'],
        ]);

        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $block = $book->blocks()
            ->where('block_uuid', $blockUuid)
            ->firstOrFail();

        abort_unless(
            $comment->book_id === $book->id && $comment->book_block_id === $block->id,
            404
        );

        $updates = [];

        if (array_key_exists('status', $validated) && $validated['status']) {
            $updates = [
                ...$updates,
                'status' => $validated['status'],
                'resolved_at' => $validated['status'] === 'resolved' ? now() : null,
                'resolved_by' => $validated['status'] === 'resolved' ? auth()->id() : null,
            ];
        }

        if (array_key_exists('metadata_json', $validated)) {
            $updates['metadata_json'] = $validated['metadata_json'];
        }

        if (array_key_exists('book_block_version_id', $validated) && $validated['book_block_version_id']) {
            $commentVersion = $block->versions()->whereKey($validated['book_block_version_id'])->firstOrFail();

            $updates['book_block_version_id'] = $commentVersion->id;
        }

        abort_if($updates === [], 422, 'No comment changes were provided.');

        $comment->forceFill($updates)->save();

        return response()->json([
            'data' => [
                'comment' => $this->serializeBlockComment($comment->load('blockVersion:id,version_number'), $block),
            ],
        ]);
    }

    public function updateBlockVoiceAssignment(Request $request, string $keyBook, string $blockUuid): JsonResponse
    {
        $validated = $request->validate([
            'voice_profile_id' => ['nullable', 'integer', 'exists:book_voice_profiles,id'],
        ]);

        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $block = $book->blocks()
            ->with('currentVersion')
            ->where('block_uuid', $blockUuid)
            ->firstOrFail();

        if (! $block->currentVersion) {
            return response()->json([
                'message' => 'The selected block has no saved version for voice assignment.',
                'errors' => [
                    'block' => ['Save the block before assigning a voice.'],
                ],
            ], 422);
        }

        $existingAssignment = $block->voiceAssignments()
            ->where('book_block_version_id', $block->currentVersion->id)
            ->first();

        if (empty($validated['voice_profile_id'])) {
            $existingAssignment?->delete();

            return response()->json([
                'data' => [
                    'assignment' => null,
                    'cleared' => true,
                ],
            ]);
        }

        $profile = $book->voiceProfiles()
            ->whereKey($validated['voice_profile_id'])
            ->firstOrFail();

        $assignment = BookBlockVoiceAssignment::query()->updateOrCreate([
            'book_block_id' => $block->id,
            'book_block_version_id' => $block->currentVersion->id,
        ], [
            'book_id' => $book->id,
            'book_voice_profile_id' => $profile->id,
            'block_uuid' => $block->block_uuid,
            'source' => 'manual',
            'created_by' => auth()->id(),
        ]);

        return response()->json([
            'data' => [
                'assignment' => $this->serializeVoiceAssignment($assignment->load(['voiceProfile', 'blockVersion:id,version_number']), $block),
                'cleared' => false,
            ],
        ]);
    }

    public function selectLibraryVoice(Request $request, string $keyBook, string $blockUuid, CoquiTtsService $coqui): JsonResponse
    {
        $validated = $request->validate([
            'audio_library_voice_id' => ['required', 'integer'],
            'tone_id' => ['nullable', 'integer'],
        ]);

        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();
        $block = $book->blocks()
            ->with('currentVersion')
            ->where('block_uuid', $blockUuid)
            ->firstOrFail();

        if (! $block->currentVersion) {
            return response()->json([
                'message' => 'Save the block before assigning a voice.',
            ], 422);
        }

        $libraryVoice = AudioLibraryVoice::query()
            ->where('account_id', auth()->id())
            ->with('samples')
            ->findOrFail($validated['audio_library_voice_id']);
        $sample = $libraryVoice->samples
            ->when(isset($validated['tone_id']), fn ($samples) => $samples->where('tone_id', $validated['tone_id']))
            ->first() ?? $libraryVoice->samples->first();

        if (! $sample || ! Storage::disk('public')->exists($sample->audio_path)) {
            return response()->json([
                'message' => 'This library voice needs an uploaded audio sample before it can be used.',
            ], 422);
        }

        try {
            if (! filled($libraryVoice->provider_voice_id)) {
                $libraryVoice->forceFill([
                    'provider' => 'at-coqui',
                    'provider_voice_id' => $coqui->registerVoice($libraryVoice->name, Storage::disk('public')->path($sample->audio_path)),
                ])->save();
            }
        } catch (\Throwable $exception) {
            return response()->json([
                'message' => 'AT could not prepare this voice for generation: '.$exception->getMessage(),
            ], 502);
        }

        $profile = $book->voiceProfiles()
            ->where('voice_provider', 'coqui-local')
            ->where('voice_id', $libraryVoice->provider_voice_id)
            ->first();

        if (! $profile) {
            $profile = BookVoiceProfile::query()->create([
                'book_id' => $book->id,
                'name' => $libraryVoice->name,
                'role' => 'narrator',
                'voice_provider' => 'coqui-local',
                'voice_id' => $libraryVoice->provider_voice_id,
                'language' => $libraryVoice->language ?: $book->lang,
                'notes' => $libraryVoice->description,
                'settings_json' => [
                    'audio_library_voice_id' => $libraryVoice->id,
                    'tone_id' => $sample->tone_id,
                ],
                'created_by' => auth()->id(),
            ]);
        }

        $assignment = BookBlockVoiceAssignment::query()->updateOrCreate([
            'book_block_id' => $block->id,
            'book_block_version_id' => $block->currentVersion->id,
        ], [
            'book_id' => $book->id,
            'book_voice_profile_id' => $profile->id,
            'block_uuid' => $block->block_uuid,
            'source' => 'audio-library',
            'created_by' => auth()->id(),
        ]);

        return response()->json([
            'data' => [
                'profile' => $this->serializeVoiceProfile($profile),
                'assignment' => $this->serializeVoiceAssignment($assignment->load(['voiceProfile', 'blockVersion:id,version_number']), $block),
            ],
        ]);
    }

    public function generateBlockAudio(Request $request, string $keyBook, string $blockUuid, CoquiTtsService $coqui): JsonResponse
    {
        // XTTS plus multilingual word alignment may take longer than PHP's
        // development default. The UI already keeps this request open while a
        // master audio group is generated.
        set_time_limit(0);

        $validated = $request->validate([
            'provider_key' => ['nullable', 'in:mock,coqui-local'],
            'model' => ['nullable', 'string', 'max:120'],
        ]);

        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $block = $book->blocks()
            ->with('currentVersion')
            ->where('block_uuid', $blockUuid)
            ->firstOrFail();

        if (! $block->currentVersion) {
            return response()->json([
                'message' => 'The selected block has no saved version for audio generation.',
                'errors' => [
                    'block' => ['Save the block before generating audio.'],
                ],
            ], 422);
        }

        $assignment = $block->voiceAssignments()
            ->with('voiceProfile')
            ->where('book_block_version_id', $block->currentVersion->id)
            ->latest('id')
            ->first();

        if (! $assignment || ! $assignment->voiceProfile) {
            return response()->json([
                'message' => 'The selected block has no voice assigned.',
                'errors' => [
                    'voice' => ['Assign a voice before generating audio.'],
                ],
            ], 422);
        }

        $providerKey = $validated['provider_key'] ?? 'mock';
        $model = $validated['model'] ?? ($providerKey === 'coqui-local' ? config('tts.coqui.model') : 'mock-tts-v1');
        $text = $block->currentVersion->text_plain ?: $block->text_plain ?: '';
        $settings = [...AudioTextSegmenter::DEFAULT_PAUSES, ...($book->audio_settings_json ?? [])];
        $parts = app(AudioTextSegmenter::class)->split($text, $settings);
        $bookLocale = strtolower(str_replace('_', '-', (string) ($book->lang ?: config('app.locale', 'en'))));
        $localeKey = explode('-', $bookLocale)[0] ?: 'en';
        $language = config("audiobook.locales.{$localeKey}.tts_code") ?: $localeKey;
        $source = $providerKey === 'coqui-local' ? 'coqui' : 'mock';

        $job = BookAudioJob::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $block->id,
            'book_block_version_id' => $block->currentVersion->id,
            'book_voice_profile_id' => $assignment->book_voice_profile_id,
            'block_uuid' => $block->block_uuid,
            'status' => 'completed',
            'provider_key' => $providerKey,
            'model' => $model,
            'source' => $source,
            'request_json' => [
                'text_plain' => $text,
                'language' => $language,
                'audio_settings' => $settings,
                'parts' => $parts,
                'voice_profile_id' => $assignment->book_voice_profile_id,
                'voice_id' => $assignment->voiceProfile->voice_id,
            ],
            'result_json' => ['parts' => count($parts)],
            'started_at' => now(),
            'completed_at' => now(),
            'created_by' => auth()->id(),
        ]);

        $segments = collect();
        try {
            foreach ($parts as $index => $part) {
                $durationMs = max(700, mb_strlen($part['text']) * 45);
                $audioPath = "mock://books/{$book->key_book}/blocks/{$block->block_uuid}/audio/{$index}";
                $result = ['mock' => true, 'duration_ms' => $durationMs];
                if ($providerKey === 'coqui-local') {
                    $result = $coqui->synthesize($part['text'], $language, $assignment->voiceProfile->voice_id);
                    $audioPath = "audiobooks/{$book->key_book}/segments/".Str::uuid().'.wav';
                    Storage::disk('public')->put($audioPath, $coqui->download($result['audio_url']));
                    $durationMs = (int) ($result['duration_ms'] ?? $durationMs);
                }
                $segments->push(BookAudioSegment::query()->create([
                    'book_id' => $book->id, 'book_block_id' => $block->id,
                    'book_block_version_id' => $block->currentVersion->id,
                    'book_voice_profile_id' => $assignment->book_voice_profile_id,
                    'book_audio_job_id' => $job->id, 'block_uuid' => $block->block_uuid,
                    'status' => 'completed', 'provider_key' => $providerKey, 'model' => $model,
                    'voice_id' => $assignment->voiceProfile->voice_id, 'audio_path' => $audioPath,
                    'duration_ms' => $durationMs, 'segment_index' => $index,
                    'source_start' => $part['start'], 'source_end' => $part['end'], 'pause_after_ms' => $part['pause_after_ms'],
                    'text_plain' => $part['source_text'], 'content_hash' => $block->currentVersion->content_hash,
                    'metadata_json' => [
                        'source' => $source, 'spoken_text' => $part['text'],
                        'voice_profile_name' => $assignment->voiceProfile->name,
                        'voice_provider' => $assignment->voiceProfile->voice_provider,
                        'alignment_status' => $result['alignment']['status'] ?? 'unavailable',
                        'alignment_language' => $result['alignment']['language'] ?? $language,
                        'word_timings' => $this->attachWordSourceOffsets(
                            $result['alignment']['words'] ?? [],
                            $part['source_text'],
                            (int) $part['start'],
                        ),
                    ],
                    'created_by' => auth()->id(),
                ]));
            }
        } catch (\Throwable $exception) {
            $job->forceFill(['status' => 'failed', 'error_message' => $exception->getMessage(), 'completed_at' => now()])->save();
            return response()->json(['message' => 'Coqui TTS generation failed: '.$exception->getMessage()], 502);
        }
        $totalDuration = $segments->sum(fn (BookAudioSegment $segment) => (int) $segment->duration_ms + (int) $segment->pause_after_ms);
        $job->forceFill(['result_json' => ['parts' => $segments->count(), 'duration_ms' => $totalDuration], 'completed_at' => now()])->save();

        return response()->json([
            'data' => [
                'job' => $this->serializeAudioJob($job->load('voiceProfile'), $block),
                // Compatibility for clients built before grouped generation.
                'segment' => $this->serializeAudioSegment($segments->first()->load(['voiceProfile', 'blockVersion:id,version_number', 'audioJob:id,status']), $block),
                'segments' => $segments->map(fn (BookAudioSegment $segment) => $this->serializeAudioSegment($segment->load(['voiceProfile', 'blockVersion:id,version_number', 'audioJob:id,status']), $block)),
                'duration_ms' => $totalDuration,
                'created' => true,
            ],
        ], 201);
    }

    public function storeBlockTranslation(
        Request $request,
        string $keyBook,
        string $blockUuid,
        EditorAiTranslationService $translations,
    ): JsonResponse {
        $validated = $request->validate([
            'target_locale' => ['required', 'string', 'max:20'],
            'provider_key' => ['nullable', 'string', 'max:80'],
            'model' => ['nullable', 'string', 'max:120'],
            'translated_text' => ['nullable', 'string', 'max:100000'],
        ]);

        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $block = $book->blocks()
            ->with('currentVersion')
            ->where('block_uuid', $blockUuid)
            ->firstOrFail();

        if (! $block->currentVersion) {
            return response()->json([
                'message' => 'The selected block has no saved version to translate.',
                'errors' => [
                    'block' => ['Save the block before creating a translation.'],
                ],
            ], 422);
        }

        $targetLocale = strtolower(trim($validated['target_locale']));
        $providerKey = $validated['provider_key'] ?? 'mock';
        $model = $validated['model'] ?? 'mock-translation-v1';
        $isManualTranslation = array_key_exists('translated_text', $validated);
        $translatedText = $isManualTranslation ? trim((string) $validated['translated_text']) : null;
        $existingTranslation = $block->translations()
            ->with('sourceBlockVersion:id,version_number')
            ->where('source_book_block_version_id', $block->currentVersion->id)
            ->where('target_locale', $targetLocale)
            ->where('status', 'draft')
            ->where('provider_key', $providerKey)
            ->where('model', $model)
            ->latest('id')
            ->first();

        if ($existingTranslation) {
            if ($isManualTranslation) {
                $existingTranslation->forceFill([
                    'translated_text' => $translatedText,
                    'source' => 'manual',
                    'notes_json' => [
                        'source_locale' => $book->lang,
                        'target_locale' => $targetLocale,
                        'manual' => true,
                    ],
                ])->save();
            }

            return response()->json([
                'data' => [
                    'translation' => $this->serializeBlockTranslation($existingTranslation, $block),
                    'created' => false,
                ],
            ]);
        }

        $sourceText = $block->currentVersion->text_plain ?: $block->text_plain ?: '';
        $generated = $isManualTranslation
            ? [
                'source' => 'manual',
                'translated_text' => $translatedText,
                'notes_json' => ['manual' => true],
            ]
            : $translations->generate($book, $block, $targetLocale, $providerKey, $model);

        $translation = BookBlockTranslation::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $block->id,
            'source_book_block_version_id' => $block->currentVersion->id,
            'block_uuid' => $block->block_uuid,
            'target_locale' => $targetLocale,
            'status' => 'draft',
            'provider_key' => $providerKey,
            'model' => $model,
            'source' => $generated['source'],
            'source_text' => $sourceText,
            'translated_text' => $generated['translated_text'],
            'notes_json' => [
                'source_locale' => $book->lang,
                'target_locale' => $targetLocale,
                ...($generated['notes_json'] ?? []),
            ],
            'created_by' => auth()->id(),
        ]);

        return response()->json([
            'data' => [
                'translation' => $this->serializeBlockTranslation($translation->load('sourceBlockVersion:id,version_number'), $block),
                'created' => true,
            ],
        ], 201);
    }

    public function updateBlockTranslation(
        Request $request,
        string $keyBook,
        string $blockUuid,
        BookBlockTranslation $translation,
    ): JsonResponse {
        $validated = $request->validate([
            'status' => ['required', 'string', 'in:approved,rejected'],
        ]);

        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $block = $book->blocks()
            ->where('block_uuid', $blockUuid)
            ->firstOrFail();

        abort_unless(
            $translation->book_id === $book->id && $translation->book_block_id === $block->id,
            404
        );

        $translation->forceFill([
            'status' => $validated['status'],
            'approved_at' => $validated['status'] === 'approved' ? now() : null,
            'resolved_at' => now(),
            'resolved_by' => auth()->id(),
        ])->save();

        return response()->json([
            'data' => [
                'translation' => $this->serializeBlockTranslation($translation->load('sourceBlockVersion:id,version_number'), $block),
            ],
        ]);
    }

    public function storeBlockReview(
        Request $request,
        string $keyBook,
        string $blockUuid,
        EditorAiCorrectionService $corrections,
    ): JsonResponse {
        $validated = $request->validate([
            'type' => ['nullable', 'string', 'in:grammar,style,continuity,rewrite'],
            'provider_key' => ['nullable', 'string', 'max:80'],
            'model' => ['nullable', 'string', 'max:120'],
        ]);

        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $block = $book->blocks()
            ->with('currentVersion')
            ->where('block_uuid', $blockUuid)
            ->firstOrFail();

        if (! $block->currentVersion) {
            return response()->json([
                'message' => 'The selected block has no saved version to review.',
                'errors' => [
                    'block' => ['Save the block before creating a review.'],
                ],
            ], 422);
        }

        $reviewType = $validated['type'] ?? 'grammar';
        $providerKey = $validated['provider_key'] ?? 'mock';
        $model = $validated['model'] ?? 'mock-correction-v1';
        $existingReview = $block->reviews()
            ->with('blockVersion:id,version_number')
            ->where('book_block_version_id', $block->currentVersion->id)
            ->where('type', $reviewType)
            ->where('status', 'draft')
            ->where('notes_json->provider_key', $providerKey)
            ->where('notes_json->model', $model)
            ->latest('id')
            ->first();

        if ($existingReview) {
            return response()->json([
                'data' => [
                    'review' => $this->serializeBlockReview($existingReview, $block),
                    'created' => false,
                ],
            ]);
        }

        $correction = $corrections->generate($book, $block, $reviewType, $providerKey, $model);

        $review = BookBlockReview::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $block->id,
            'book_block_version_id' => $block->currentVersion->id,
            'type' => $reviewType,
            'status' => 'draft',
            'source' => $correction['source'],
            'original_text' => $correction['original_text'],
            'suggested_text' => $correction['suggested_text'],
            'notes_json' => $correction['notes_json'],
            'created_by' => auth()->id(),
        ]);

        return response()->json([
            'data' => [
                'review' => $this->serializeBlockReview($review->load('blockVersion:id,version_number'), $block),
                'created' => true,
            ],
        ], 201);
    }

    public function updateBlockReview(Request $request, string $keyBook, string $blockUuid, BookBlockReview $review): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', 'in:applied,rejected'],
            'applied_book_block_version_id' => ['nullable', 'integer', 'exists:book_block_versions,id'],
        ]);

        $book = Book::query()
            ->where('key_book', $keyBook)
            ->firstOrFail();

        $block = $book->blocks()
            ->where('block_uuid', $blockUuid)
            ->firstOrFail();

        abort_unless(
            $review->book_id === $book->id && $review->book_block_id === $block->id,
            404
        );

        if ($validated['status'] === 'applied' && isset($validated['applied_book_block_version_id'])) {
            $versionBelongsToBlock = $block->versions()
                ->whereKey($validated['applied_book_block_version_id'])
                ->exists();

            abort_unless($versionBelongsToBlock, 422);
        }

        $review->forceFill([
            'status' => $validated['status'],
            'applied_book_block_version_id' => $validated['status'] === 'applied'
                ? ($validated['applied_book_block_version_id'] ?? null)
                : null,
            'resolved_at' => now(),
            'resolved_by' => auth()->id(),
        ])->save();

        return response()->json([
            'data' => [
                'review' => $this->serializeBlockReview($review->load('blockVersion:id,version_number'), $block),
            ],
        ]);
    }

    private function serializeEditorBlock(BookBlock $block): array
    {
        return [
            'id' => $block->id,
            'block_uuid' => $block->block_uuid,
            'type' => $block->type,
            'sort_order' => $block->sort_order,
            'parent_block_id' => $block->parent_block_id,
            'current_version_id' => $block->current_version_id,
            'content_hash' => $block->content_hash,
            'status' => $block->status,
            'text_plain' => $block->text_plain,
            'content_json' => $this->serializeEditorContent($block),
        ];
    }

    private function serializeEditorContent(BookBlock $block): ?array
    {
        if (! $block->content_json) {
            return null;
        }

        return [
            ...$block->content_json,
            'attrs' => [
                ...($block->content_json['attrs'] ?? []),
                'blockId' => $block->block_uuid,
            ],
        ];
    }

    private function serializeBlockReview(BookBlockReview $review, BookBlock $block): array
    {
        return [
            'id' => $review->id,
            'type' => $review->type,
            'status' => $review->status,
            'source' => $review->source,
            'original_text' => $review->original_text,
            'suggested_text' => $review->suggested_text,
            'notes_json' => $review->notes_json,
            'created_at' => $review->created_at?->toISOString(),
            'resolved_at' => $review->resolved_at?->toISOString(),
            'block_version_id' => $review->book_block_version_id,
            'applied_block_version_id' => $review->applied_book_block_version_id,
            'version_number' => $review->blockVersion?->version_number,
            'is_current_version' => $block->current_version_id === $review->book_block_version_id,
        ];
    }

    private function serializeBlockComment(BookBlockComment $comment, BookBlock $block): array
    {
        return [
            'id' => $comment->id,
            'status' => $comment->status,
            'body' => $comment->body,
            'metadata_json' => $comment->metadata_json,
            'created_at' => $comment->created_at?->toISOString(),
            'resolved_at' => $comment->resolved_at?->toISOString(),
            'block_uuid' => $comment->block_uuid,
            'block_version_id' => $comment->book_block_version_id,
            'version_number' => $comment->blockVersion?->version_number,
            'is_current_version' => $block->current_version_id === $comment->book_block_version_id,
            'block_type' => $block->type,
            'block_sort_order' => $block->sort_order,
            'block_text_plain' => $block->text_plain,
        ];
    }

    private function serializeVoiceProfile(BookVoiceProfile $profile): array
    {
        return [
            'id' => $profile->id,
            'name' => $profile->name,
            'role' => $profile->role,
            'voice_provider' => $profile->voice_provider,
            'voice_id' => $profile->voice_id,
            'language' => $profile->language,
            'notes' => $profile->notes,
            'settings_json' => $profile->settings_json,
            'created_at' => $profile->created_at?->toISOString(),
            'updated_at' => $profile->updated_at?->toISOString(),
        ];
    }

    private function serializeVoiceAssignment(BookBlockVoiceAssignment $assignment, BookBlock $block): array
    {
        return [
            'id' => $assignment->id,
            'block_uuid' => $assignment->block_uuid,
            'block_version_id' => $assignment->book_block_version_id,
            'version_number' => $assignment->blockVersion?->version_number,
            'voice_profile_id' => $assignment->book_voice_profile_id,
            'source' => $assignment->source,
            'metadata_json' => $assignment->metadata_json,
            'voice_profile' => $assignment->voiceProfile
                ? $this->serializeVoiceProfile($assignment->voiceProfile)
                : null,
            'is_current_version' => $block->current_version_id === $assignment->book_block_version_id,
            'created_at' => $assignment->created_at?->toISOString(),
            'updated_at' => $assignment->updated_at?->toISOString(),
        ];
    }

    private function serializeAudioJob(BookAudioJob $job, BookBlock $block): array
    {
        return [
            'id' => $job->id,
            'status' => $job->status,
            'provider_key' => $job->provider_key,
            'model' => $job->model,
            'source' => $job->source,
            'block_uuid' => $job->block_uuid,
            'block_version_id' => $job->book_block_version_id,
            'voice_profile_id' => $job->book_voice_profile_id,
            'voice_profile' => $job->voiceProfile
                ? $this->serializeVoiceProfile($job->voiceProfile)
                : null,
            'request_json' => $job->request_json,
            'result_json' => $job->result_json,
            'error_message' => $job->error_message,
            'started_at' => $job->started_at?->toISOString(),
            'completed_at' => $job->completed_at?->toISOString(),
            'created_at' => $job->created_at?->toISOString(),
            'is_current_version' => $block->current_version_id === $job->book_block_version_id,
        ];
    }

    /**
     * Align WhisperX word timestamps to the Unicode offsets used by the
     * manuscript. Timing is optional, so unmatchable words are skipped rather
     * than making TTS generation fail for a particular language or script.
     *
     * @param array<int, array<string, mixed>> $timings
     * @return array<int, array<string, mixed>>
     */
    private function attachWordSourceOffsets(array $timings, string $sourceText, int $segmentStart): array
    {
        $cursor = 0;
        $mapped = [];

        foreach ($timings as $timing) {
            $word = trim((string) ($timing['word'] ?? ''));
            $needle = preg_replace('/^[\\p{P}\\p{S}\\s]+|[\\p{P}\\p{S}\\s]+$/u', '', $word) ?? '';
            if ($needle === '') {
                continue;
            }

            $position = mb_stripos($sourceText, $needle, $cursor, 'UTF-8');
            if ($position === false) {
                continue;
            }

            $length = mb_strlen($needle, 'UTF-8');
            $mapped[] = [...$timing, 'source_start' => $segmentStart + $position, 'source_end' => $segmentStart + $position + $length];
            $cursor = $position + $length;
        }

        return $mapped;
    }

    private function serializeAudioSegment(BookAudioSegment $segment, BookBlock $block): array
    {
        return [
            'id' => $segment->id,
            'status' => $segment->status,
            'provider_key' => $segment->provider_key,
            'model' => $segment->model,
            'voice_id' => $segment->voice_id,
            'audio_path' => $segment->audio_path,
            'duration_ms' => $segment->duration_ms,
            'text_plain' => $segment->text_plain,
            'content_hash' => $segment->content_hash,
            'metadata_json' => $segment->metadata_json,
            'block_uuid' => $segment->block_uuid,
            'block_version_id' => $segment->book_block_version_id,
            'version_number' => $segment->blockVersion?->version_number,
            'voice_profile_id' => $segment->book_voice_profile_id,
            'voice_profile' => $segment->voiceProfile
                ? $this->serializeVoiceProfile($segment->voiceProfile)
                : null,
            'audio_job_id' => $segment->book_audio_job_id,
            'audio_job_status' => $segment->audioJob?->status,
            'is_current_version' => $block->current_version_id === $segment->book_block_version_id,
            'created_at' => $segment->created_at?->toISOString(),
            'updated_at' => $segment->updated_at?->toISOString(),
        ];
    }

    private function serializeBlockTranslation(BookBlockTranslation $translation, BookBlock $block): array
    {
        return [
            'id' => $translation->id,
            'target_locale' => $translation->target_locale,
            'status' => $translation->status,
            'provider_key' => $translation->provider_key,
            'model' => $translation->model,
            'source' => $translation->source,
            'source_text' => $translation->source_text,
            'translated_text' => $translation->translated_text,
            'notes_json' => $translation->notes_json,
            'block_uuid' => $translation->block_uuid,
            'source_block_version_id' => $translation->source_book_block_version_id,
            'applied_block_version_id' => $translation->applied_book_block_version_id,
            'version_number' => $translation->sourceBlockVersion?->version_number,
            'is_current_version' => $block->current_version_id === $translation->source_book_block_version_id,
            'approved_at' => $translation->approved_at?->toISOString(),
            'resolved_at' => $translation->resolved_at?->toISOString(),
            'created_at' => $translation->created_at?->toISOString(),
            'updated_at' => $translation->updated_at?->toISOString(),
        ];
    }

    private function serializeTranslationJob(BookTranslationJob $job): array
    {
        $total = max(0, $job->total_blocks);

        return [
            'id' => $job->id,
            'target_locale' => $job->target_locale,
            'status' => $job->status,
            'provider_key' => $job->provider_key,
            'model' => $job->model,
            'total_blocks' => $total,
            'completed_blocks' => $job->completed_blocks,
            'skipped_blocks' => $job->skipped_blocks,
            'failed_blocks' => $job->failed_blocks,
            'reserved_credits' => $job->reserved_credits,
            'consumed_credits' => $job->consumed_credits,
            'released_credits' => $job->released_credits,
            'current_block_uuid' => $job->current_block_uuid,
            'progress_percent' => $total ? (int) round(($job->completed_blocks / $total) * 100) : 0,
            'request_json' => $job->request_json,
            'error_message' => $job->error_message,
            'started_at' => $job->started_at?->toISOString(),
            'completed_at' => $job->completed_at?->toISOString(),
            'created_at' => $job->created_at?->toISOString(),
        ];
    }

    private function serializeTranslationTerm(BookTranslationTerm $term): array
    {
        return [
            'id' => $term->id,
            'source_term' => $term->source_term,
            'target_term' => $term->target_term,
            'target_locale' => $term->target_locale,
            'notes' => $term->notes,
            'updated_at' => $term->updated_at?->toISOString(),
        ];
    }

    private function chatBlock(Book $book, string $scope, ?string $blockUuid): ?BookBlock
    {
        if ($scope !== 'block' || ! $blockUuid) {
            return null;
        }

        return $book->blocks()
            ->with('currentVersion')
            ->where('block_uuid', $blockUuid)
            ->first();
    }

    private function findChatThread(Book $book, string $scope, ?BookBlock $block): ?AiChatThread
    {
        return AiChatThread::query()
            ->where('book_id', $book->id)
            ->where('scope', $scope)
            ->where('book_block_id', $block?->id)
            ->where('book_block_version_id', $block?->current_version_id)
            ->latest('id')
            ->first();
    }

    private function firstOrCreateChatThread(Book $book, string $scope, ?BookBlock $block, string $message): AiChatThread
    {
        return $this->findChatThread($book, $scope, $block) ?: AiChatThread::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $block?->id,
            'book_block_version_id' => $block?->current_version_id,
            'scope' => $scope,
            'block_uuid' => $block?->block_uuid,
            'title' => mb_substr(trim($message), 0, 180),
            'created_by' => auth()->id(),
        ]);
    }

    private function versionComparison(BookBlock $block, $version, $compareVersion = null): ?array
    {
        if ($compareVersion && (int) $compareVersion->id !== (int) $version->id) {
            return $version->version_number <= $compareVersion->version_number
                ? [$version, $compareVersion]
                : [$compareVersion, $version];
        }

        $ordered = $block->versions()
            ->orderBy('version_number')
            ->get();
        $current = $ordered->firstWhere('id', $block->current_version_id) ?: $ordered->last();

        if (! $current) {
            return null;
        }

        if ((int) $version->id !== (int) $current->id) {
            return [$version, $current];
        }

        $currentIndex = $ordered->search(fn ($item) => (int) $item->id === (int) $version->id);
        $previous = $currentIndex !== false ? $ordered->get($currentIndex - 1) : null;

        return $previous ? [$previous, $version] : null;
    }

    private function latestVersionExplanation($version): ?array
    {
        $thread = $version->aiChatThreads()
            ->where('scope', 'versions')
            ->latest('id')
            ->first();

        return $thread ? $this->serializeVersionExplanation($thread) : null;
    }

    private function serializeVersionExplanation(AiChatThread $thread): ?array
    {
        $message = $thread->messages()
            ->where('role', 'assistant')
            ->latest('id')
            ->first();

        if (! $message) {
            return null;
        }

        return [
            'id' => $message->id,
            'thread_id' => $thread->id,
            'answer' => $message->content,
            'source' => $message->source,
            'provider_key' => $message->provider_key,
            'provider_name' => $message->metadata_json['provider_name'] ?? $message->provider_key,
            'model' => $message->model,
            'metadata' => $message->metadata_json ?? [],
            'created_at' => $message->created_at?->toISOString(),
        ];
    }

    private function serializeChatThread(AiChatThread $thread): array
    {
        return [
            'id' => $thread->id,
            'book_id' => $thread->book_id,
            'scope' => $thread->scope,
            'block_uuid' => $thread->block_uuid,
            'book_block_version_id' => $thread->book_block_version_id,
            'title' => $thread->title,
            'created_at' => $thread->created_at?->toISOString(),
            'updated_at' => $thread->updated_at?->toISOString(),
        ];
    }

    private function serializeChatMessages(AiChatThread $thread): array
    {
        return $thread->messages()
            ->where('role', 'assistant')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (AiChatMessage $message) => [
                'id' => $message->id,
                'question' => $message->metadata_json['message'] ?? '',
                'answer' => $message->content,
                'role' => $message->role,
                'source' => $message->source,
                'provider_key' => $message->provider_key,
                'provider_name' => $message->metadata_json['provider_name'] ?? $message->provider_key,
                'model' => $message->model,
                'metadata' => $message->metadata_json ?? [],
                'created_at' => $message->created_at?->toISOString(),
            ])
            ->values()
            ->all();
    }
}
