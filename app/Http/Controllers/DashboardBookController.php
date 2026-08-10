<?php

namespace App\Http\Controllers;

use App\Exceptions\BookBlockVersionConflictException;
use App\Models\AiChatMessage;
use App\Models\AiChatThread;
use App\Models\Book;
use App\Models\BookAudioJob;
use App\Models\BookAudioSegment;
use App\Models\BookBlock;
use App\Models\BookBlockComment;
use App\Models\BookBlockReview;
use App\Models\BookBlockTranslation;
use App\Models\BookBlockVoiceAssignment;
use App\Models\BookCategory;
use App\Models\BookVoiceProfile;
use App\Services\Ai\EditorAiChatService;
use App\Services\Ai\EditorAiCorrectionService;
use App\Services\Ai\EditorAiVersionService;
use App\Services\BookBlockService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

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
                'categories_count' => count($book->categories ?? []),
                'lang' => $book->lang,
                'cover_img' => $book->cover_img,
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

        return response()->json([
            'data' => [
                'block' => $this->serializeEditorBlock($block),
                'assignment' => $assignment ? $this->serializeVoiceAssignment($assignment, $block) : null,
                'segments' => $segments
                    ->map(fn (BookAudioSegment $segment) => $this->serializeAudioSegment($segment, $block))
                    ->values(),
            ],
        ]);
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

    public function generateBlockAudio(Request $request, string $keyBook, string $blockUuid): JsonResponse
    {
        $validated = $request->validate([
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
        $model = $validated['model'] ?? 'mock-tts-v1';
        $text = $block->currentVersion->text_plain ?: $block->text_plain ?: '';
        $durationMs = max(700, mb_strlen($text) * 45);

        $job = BookAudioJob::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $block->id,
            'book_block_version_id' => $block->currentVersion->id,
            'book_voice_profile_id' => $assignment->book_voice_profile_id,
            'block_uuid' => $block->block_uuid,
            'status' => 'completed',
            'provider_key' => $providerKey,
            'model' => $model,
            'source' => 'mock',
            'request_json' => [
                'text_plain' => $text,
                'voice_profile_id' => $assignment->book_voice_profile_id,
                'voice_id' => $assignment->voiceProfile->voice_id,
            ],
            'result_json' => [
                'mock' => true,
                'duration_ms' => $durationMs,
            ],
            'started_at' => now(),
            'completed_at' => now(),
            'created_by' => auth()->id(),
        ]);

        $segment = BookAudioSegment::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $block->id,
            'book_block_version_id' => $block->currentVersion->id,
            'book_voice_profile_id' => $assignment->book_voice_profile_id,
            'book_audio_job_id' => $job->id,
            'block_uuid' => $block->block_uuid,
            'status' => 'completed',
            'provider_key' => $providerKey,
            'model' => $model,
            'voice_id' => $assignment->voiceProfile->voice_id,
            'audio_path' => "mock://books/{$book->key_book}/blocks/{$block->block_uuid}/audio/{$job->id}",
            'duration_ms' => $durationMs,
            'text_plain' => $text,
            'content_hash' => $block->currentVersion->content_hash,
            'metadata_json' => [
                'source' => 'mock',
                'voice_profile_name' => $assignment->voiceProfile->name,
                'voice_provider' => $assignment->voiceProfile->voice_provider,
            ],
            'created_by' => auth()->id(),
        ]);

        return response()->json([
            'data' => [
                'job' => $this->serializeAudioJob($job->load('voiceProfile'), $block),
                'segment' => $this->serializeAudioSegment($segment->load(['voiceProfile', 'blockVersion:id,version_number', 'audioJob:id,status']), $block),
                'created' => true,
            ],
        ], 201);
    }

    public function storeBlockTranslation(Request $request, string $keyBook, string $blockUuid): JsonResponse
    {
        $validated = $request->validate([
            'target_locale' => ['required', 'string', 'max:20'],
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
                'message' => 'The selected block has no saved version to translate.',
                'errors' => [
                    'block' => ['Save the block before creating a translation.'],
                ],
            ], 422);
        }

        $targetLocale = strtolower(trim($validated['target_locale']));
        $providerKey = $validated['provider_key'] ?? 'mock';
        $model = $validated['model'] ?? 'mock-translation-v1';
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
            return response()->json([
                'data' => [
                    'translation' => $this->serializeBlockTranslation($existingTranslation, $block),
                    'created' => false,
                ],
            ]);
        }

        $sourceText = $block->currentVersion->text_plain ?: $block->text_plain ?: '';
        $translation = BookBlockTranslation::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $block->id,
            'source_book_block_version_id' => $block->currentVersion->id,
            'block_uuid' => $block->block_uuid,
            'target_locale' => $targetLocale,
            'status' => 'draft',
            'provider_key' => $providerKey,
            'model' => $model,
            'source' => 'mock',
            'source_text' => $sourceText,
            'translated_text' => "[{$targetLocale}] {$sourceText}",
            'notes_json' => [
                'mock' => true,
                'source_locale' => $book->lang,
                'target_locale' => $targetLocale,
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
