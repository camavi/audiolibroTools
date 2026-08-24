<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" data-theme="light" data-themes="light,dark">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="csrf-token" content="{{ csrf_token() }}">
        <title>Audiobook Tools Editor Dashboard</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
        <script>
            (() => {
                const savedTheme = localStorage.getItem('audiobook-tools:theme');
                document.documentElement.dataset.theme = savedTheme === 'dark' ? 'dark' : 'light';
            })();

            window.CMSwift_setting = {
                modeDev: @js((bool) config('app.debug')),
                themes: ['light', 'dark'],
                themeList: ['light', 'dark'],
                http: {
                //baseURL: "https://cmswift.com/api",
                timeout: 900000,
                credentials: "include",
                headers: {
                "Accept": "application/json",
                "X-App": "audiobook-tools",
                "X-CSRF-TOKEN": document.querySelector('meta[name="csrf-token"]').getAttribute('content')
                },
                retry: {
                attempts: 2,
                delay: 250,
                factor: 2
                }
            }
            };
            window.AudiobookToolsBootstrap = {
                role: @js(auth()->user()?->role ?? 'user'),
                locale: @js(app()->getLocale()),
                locales: @js(collect(config('audiobook.locales'))->map(fn (array $locale, string $code) => [
                    'value' => $code,
                    'label' => strtoupper($code) . ' · ' . $locale['name'],
                    'direction' => $locale['direction'] ?? 'ltr',
                ])->values()),
            };
        </script>
        @vite(['resources/css/dashboard.css', 'resources/css/bookEditor.css', 'resources/js/dashboard.js'])
    </head>
    <body>
        <div id="dashboard-root"></div>
    </body>
</html>
