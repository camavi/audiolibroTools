<?php

return [
    'qwen' => [
        'base_url' => env('QWEN_TTS_URL', 'http://127.0.0.1:8020'),
        'api_key' => env('QWEN_TTS_API_KEY'),
        'model' => env('QWEN_TTS_MODEL', 'quality'),
        'timeout' => (int) env('QWEN_TTS_TIMEOUT', 900),
    ],
];
