<?php

namespace App\Http\Controllers;

use App\Exceptions\BookBlockVersionConflictException;
use App\Models\AiChatMessage;
use App\Models\AiChatThread;
use App\Models\Book;
use App\Models\BookBlock;
use App\Models\BookBlockComment;
use App\Models\BookBlockReview;
use App\Models\BookBlockVoiceAssignment;
use App\Models\BookCategory;
use App\Models\BookVoiceProfile;
use App\Services\Ai\EditorAiChatService;
use App\Services\Ai\EditorAiCorrectionService;
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
                    ])
                    ->values(),
            ],
        ]);
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

        $comment = BookBlockComment::query()->create([
            'book_id' => $book->id,
            'book_block_id' => $block->id,
            'book_block_version_id' => $block->currentVersion->id,
            'block_uuid' => $block->block_uuid,
            'status' => 'open',
            'body' => trim($validated['body']),
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
            'status' => ['required', 'string', 'in:open,resolved'],
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

        $comment->forceFill([
            'status' => $validated['status'],
            'resolved_at' => $validated['status'] === 'resolved' ? now() : null,
            'resolved_by' => $validated['status'] === 'resolved' ? auth()->id() : null,
        ])->save();

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
