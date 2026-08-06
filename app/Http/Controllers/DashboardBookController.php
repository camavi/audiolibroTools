<?php

namespace App\Http\Controllers;

use App\Exceptions\BookBlockVersionConflictException;
use App\Models\Book;
use App\Models\BookBlock;
use App\Models\BookCategory;
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
}
