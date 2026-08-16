<?php

use App\Http\Controllers\AudioLibraryController;
use App\Http\Controllers\AudioMediaController;
use App\Http\Controllers\DashboardAiController;
use App\Http\Controllers\DashboardBookController;
use Illuminate\Support\Facades\Route;

Route::get('/project-plan', function () {
    $documents = [
        'AI Index' => 'ai/ai.md',
        'Overview prodotto' => 'ai/project/overview.md',
        'Architettura tecnica' => 'ai/project/architecture.md',
        'Multilingua' => 'ai/project/multilingual.md',
        'UI e design system' => 'ai/project/ui-design.md',
        'Moduli funzionali' => 'ai/project/modules.md',
        'Timeline sviluppo' => 'ai/workflow/timeline.md',
        'Decisioni tecniche' => 'ai/workflow/decisions.md',
        'Registro avanzamento' => 'ai/workflow/changelog.md',
        'Riferimenti vecchio progetto' => 'ai/reference/old-project.md',
    ];

    return view('project-plan', ['documents' => $documents]);
})->name('project-plan');

Route::get('/project-plan/file/{path}', function (string $path) {
    $safePath = str_replace('..', '', $path);
    $file = base_path("ai/{$safePath}");

    abort_unless(str_starts_with(realpath($file) ?: '', realpath(base_path('ai'))), 404);
    abort_unless(file_exists($file) && str_ends_with($file, '.md'), 404);

    return response()->file($file, [
        'Content-Type' => 'text/markdown; charset=UTF-8',
    ]);
})->where('path', '.*')->name('project-plan.file');

Route::get('/dashboard', function () {
    return view('dashboard');
})->where('any', '.*');
Route::prefix('dashboard/api')->name('dashboard.api.')->group(function () {
    Route::get('/ai/providers', [DashboardAiController::class, 'providers'])->name('ai.providers');
    Route::get('/ai/credits', [DashboardAiController::class, 'credits'])->name('ai.credits');
    Route::post('/ai/providers', [DashboardAiController::class, 'storeProvider'])->name('ai.providers.store');
    Route::patch('/ai/settings', [DashboardAiController::class, 'updateSetting'])->name('ai.settings.update');
    Route::get('/book-categories', [DashboardBookController::class, 'categories'])->name('book-categories');
    Route::get('/audio-library/voices', [AudioLibraryController::class, 'index'])->name('audio-library.voices');
    Route::post('/audio-library/voices', [AudioLibraryController::class, 'store'])->name('audio-library.voices.store');
    Route::get('/audio-library/samples/{sample}/stream', [AudioLibraryController::class, 'stream'])->name('audio-library.samples.stream');
    Route::post('/audio-library/voices/{voice}', [AudioLibraryController::class, 'update'])->name('audio-library.voices.update');
    Route::delete('/audio-library/voices/{voice}', [AudioLibraryController::class, 'destroy'])->name('audio-library.voices.destroy');
    Route::get('/audio-media', [AudioMediaController::class, 'index'])->name('audio-media.index');
    Route::post('/audio-media', [AudioMediaController::class, 'store'])->name('audio-media.store');
    Route::get('/audio-media/{asset}/stream', [AudioMediaController::class, 'stream'])->name('audio-media.stream');
    Route::get('/books', [DashboardBookController::class, 'index'])->name('books.index');
    Route::post('/books', [DashboardBookController::class, 'store'])->name('books.store');
    Route::get('/books/{keyBook}', [DashboardBookController::class, 'show'])->name('books.show');
    Route::patch('/books/{keyBook}', [DashboardBookController::class, 'update'])->name('books.update');
    Route::get('/books/{keyBook}/editor', [DashboardBookController::class, 'editor'])->name('books.editor');
    Route::get('/books/{keyBook}/voices', [DashboardBookController::class, 'voiceProfiles'])->name('books.voices');
    Route::get('/books/{keyBook}/audio-timeline', [DashboardBookController::class, 'audioTimeline'])->name('books.audio-timeline');
    Route::put('/books/{keyBook}/audio-timeline', [DashboardBookController::class, 'saveAudioTimeline'])->name('books.audio-timeline.save');
    Route::post('/books/{keyBook}/audio-publish', [DashboardBookController::class, 'publishAudioTimeline'])->name('books.audio-publish');
    Route::delete('/books/{keyBook}/audio-timeline/{timelineItem}', [DashboardBookController::class, 'deleteAudioTimelineItem'])->name('books.audio-timeline.delete');
    Route::post('/books/{keyBook}/voices', [DashboardBookController::class, 'storeVoiceProfile'])->name('books.voices.store');
    Route::patch('/books/{keyBook}/voices/{voiceProfile}', [DashboardBookController::class, 'updateVoiceProfile'])->name('books.voices.update');
    Route::delete('/books/{keyBook}/voices/{voiceProfile}', [DashboardBookController::class, 'deleteVoiceProfile'])->name('books.voices.delete');
    Route::get('/books/{keyBook}/translation-terms', [DashboardBookController::class, 'translationTerms'])->name('books.translation-terms');
    Route::post('/books/{keyBook}/translation-terms', [DashboardBookController::class, 'storeTranslationTerm'])->name('books.translation-terms.store');
    Route::delete('/books/{keyBook}/translation-terms/{term}', [DashboardBookController::class, 'deleteTranslationTerm'])->name('books.translation-terms.delete');
    Route::get('/books/{keyBook}/translation-progress', [DashboardBookController::class, 'translationProgress'])->name('books.translation-progress');
    Route::get('/books/{keyBook}/translation-jobs/current', [DashboardBookController::class, 'translationJob'])->name('books.translation-jobs.current');
    Route::post('/books/{keyBook}/translation-jobs', [DashboardBookController::class, 'startTranslationJob'])->name('books.translation-jobs.store');
    Route::patch('/books/{keyBook}/translation-jobs/{job}/cancel', [DashboardBookController::class, 'cancelTranslationJob'])->name('books.translation-jobs.cancel');
    Route::get('/books/{keyBook}/ai/chat', [DashboardBookController::class, 'aiChatThread'])->name('books.ai.chat.thread');
    Route::post('/books/{keyBook}/ai/chat', [DashboardBookController::class, 'aiChat'])->name('books.ai.chat');
    Route::get('/books/{keyBook}/activity', [DashboardBookController::class, 'bookActivity'])->name('books.activity');
    Route::get('/books/{keyBook}/comments', [DashboardBookController::class, 'bookComments'])->name('books.comments');
    Route::get('/books/{keyBook}/comments/summary', [DashboardBookController::class, 'blockCommentSummary'])->name('books.comments.summary');
    Route::get('/books/{keyBook}/blocks/{blockUuid}/versions', [DashboardBookController::class, 'blockVersions'])->name('books.blocks.versions');
    Route::post('/books/{keyBook}/blocks/{blockUuid}/versions/explain', [DashboardBookController::class, 'explainBlockVersion'])->name('books.blocks.versions.explain');
    Route::post('/books/{keyBook}/blocks/{blockUuid}/versions/restore', [DashboardBookController::class, 'restoreBlockVersion'])->name('books.blocks.versions.restore');
    Route::get('/books/{keyBook}/blocks/{blockUuid}/voice-assignment', [DashboardBookController::class, 'blockVoiceAssignment'])->name('books.blocks.voice-assignment');
    Route::patch('/books/{keyBook}/blocks/{blockUuid}/voice-assignment', [DashboardBookController::class, 'updateBlockVoiceAssignment'])->name('books.blocks.voice-assignment.update');
    Route::post('/books/{keyBook}/blocks/{blockUuid}/library-voice', [DashboardBookController::class, 'selectLibraryVoice'])->name('books.blocks.library-voice.select');
    Route::get('/books/{keyBook}/blocks/{blockUuid}/audio', [DashboardBookController::class, 'blockAudio'])->name('books.blocks.audio');
    Route::post('/books/{keyBook}/blocks/{blockUuid}/audio/generate', [DashboardBookController::class, 'generateBlockAudio'])->name('books.blocks.audio.generate');
    Route::patch('/books/{keyBook}/audio-settings', [DashboardBookController::class, 'updateAudioSettings'])->name('books.audio-settings.update');
    Route::post('/books/{keyBook}/audio/generate-all', [DashboardBookController::class, 'generateBookAudio'])->name('books.audio.generate-all');
    Route::get('/books/{keyBook}/audio/insert-all-summary', [DashboardBookController::class, 'insertAllAudioSummary'])->name('books.audio.insert-all.summary');
    Route::post('/books/{keyBook}/audio/insert-all', [DashboardBookController::class, 'insertAllAudioTimeline'])->name('books.audio.insert-all');
    Route::delete('/books/{keyBook}/blocks/{blockUuid}/audio/{job}', [DashboardBookController::class, 'deleteAudioGroup'])->name('books.blocks.audio.delete');
    Route::post('/books/{keyBook}/blocks/{blockUuid}/audio/{job}/insert-timeline', [DashboardBookController::class, 'insertAudioGroupTimeline'])->name('books.blocks.audio.insert-timeline');
    Route::post('/books/{keyBook}/audio-timeline/group', [DashboardBookController::class, 'groupAudioTimelineItems'])->name('books.audio-timeline.group');
    Route::post('/books/{keyBook}/audio-timeline/{timelineItem}/ungroup', [DashboardBookController::class, 'ungroupAudioTimelineItem'])->name('books.audio-timeline.ungroup');
    Route::get('/books/{keyBook}/blocks/{blockUuid}/translations', [DashboardBookController::class, 'blockTranslations'])->name('books.blocks.translations');
    Route::post('/books/{keyBook}/blocks/{blockUuid}/translations', [DashboardBookController::class, 'storeBlockTranslation'])->name('books.blocks.translations.store');
    Route::patch('/books/{keyBook}/blocks/{blockUuid}/translations/{translation}', [DashboardBookController::class, 'updateBlockTranslation'])->name('books.blocks.translations.update');
    Route::get('/books/{keyBook}/blocks/{blockUuid}/comments', [DashboardBookController::class, 'blockComments'])->name('books.blocks.comments');
    Route::post('/books/{keyBook}/blocks/{blockUuid}/comments', [DashboardBookController::class, 'storeBlockComment'])->name('books.blocks.comments.store');
    Route::patch('/books/{keyBook}/blocks/{blockUuid}/comments/{comment}', [DashboardBookController::class, 'updateBlockComment'])->name('books.blocks.comments.update');
    Route::get('/books/{keyBook}/blocks/{blockUuid}/reviews', [DashboardBookController::class, 'blockReviews'])->name('books.blocks.reviews');
    Route::post('/books/{keyBook}/blocks/{blockUuid}/reviews', [DashboardBookController::class, 'storeBlockReview'])->name('books.blocks.reviews.store');
    Route::patch('/books/{keyBook}/blocks/{blockUuid}/reviews/{review}', [DashboardBookController::class, 'updateBlockReview'])->name('books.blocks.reviews.update');
    Route::patch('/books/{keyBook}/blocks', [DashboardBookController::class, 'updateBlocks'])->name('books.blocks.update');
});
Route::get('/dashboard/{any?}', function () {
    return view('dashboard');
})->where('any', '.*');

Route::get('/{locale?}', function (?string $locale = null) {
    $supportedLocales = array_keys(config('audiobook.locales'));

    if ($locale && in_array($locale, $supportedLocales, true)) {
        app()->setLocale($locale);
    }

    return view('welcome');
})->where('locale', 'en|it|es|fr|de|pt|pl|tr|ru|nl|cs|ar|zh|ja|hu|ko');
