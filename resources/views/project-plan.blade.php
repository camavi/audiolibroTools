<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Project Plan - Audiobook Tools</title>
        @vite(['resources/css/app.css', 'resources/js/app.js'])
    </head>
    <body>
        <main class="doc-index">
            <a class="doc-back" href="{{ url('/' . app()->getLocale()) }}">Audiobook Tools</a>
            <h1>Project Plan</h1>
            <p>Indice dei file di lavoro nella cartella <code>ai/</code>.</p>

            <div class="doc-list">
                @foreach ($documents as $title => $path)
                    @php
                        $relativePath = str($path)->after('ai/')->toString();
                    @endphp
                    <a href="{{ route('project-plan.file', ['path' => $relativePath]) }}">
                        <strong>{{ $title }}</strong>
                        <code>{{ $path }}</code>
                    </a>
                @endforeach
            </div>
        </main>
    </body>
</html>
