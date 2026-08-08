<?php

use App\Http\Controllers\DashboardBookController;
use App\Http\Controllers\DashboardAiController;
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
    Route::post('/ai/providers', [DashboardAiController::class, 'storeProvider'])->name('ai.providers.store');
    Route::patch('/ai/settings', [DashboardAiController::class, 'updateSetting'])->name('ai.settings.update');
    Route::get('/book-categories', [DashboardBookController::class, 'categories'])->name('book-categories');
    Route::post('/books', [DashboardBookController::class, 'store'])->name('books.store');
    Route::get('/books/{keyBook}/editor', [DashboardBookController::class, 'editor'])->name('books.editor');
    Route::get('/books/{keyBook}/blocks/{blockUuid}/versions', [DashboardBookController::class, 'blockVersions'])->name('books.blocks.versions');
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
