<?php

return [
    'coqui' => [
        'base_url' => env('COQUI_TTS_URL', 'http://127.0.0.1:8020'),
        'api_key' => env('COQUI_TTS_API_KEY'),
        'model' => env('COQUI_TTS_MODEL', 'xtts-v2'),
        'timeout' => (int) env('COQUI_TTS_TIMEOUT', 900),
    ],
];
