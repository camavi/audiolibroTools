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

            window.CMSwift_setting = {
                modeDev: true,
                themes: ['light', 'dark'],
                themeList: ['light', 'dark'],
                http: {
                //baseURL: "https://cmswift.com/api",
                timeout: 10000,
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
        </script>
        @vite(['resources/css/dashboard.css', 'resources/js/dashboard.js'])
    </head>
    <body>
        <div id="dashboard-root"></div>
    </body>
</html>
