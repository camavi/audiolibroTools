<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use App\Http\Middleware\EnsureStaffRole;
use App\Http\Middleware\EnsureAccountIsActive;
use App\Http\Middleware\EnsureAccountCanWrite;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->redirectGuestsTo('/');
        $middleware->alias(['staff' => EnsureStaffRole::class, 'account.active' => EnsureAccountIsActive::class, 'account.can-write' => EnsureAccountCanWrite::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->is('dashboard/api/*') || $request->expectsJson(),
        );
    })->create();
