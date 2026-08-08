<?php

return [
    'defaults' => [
        [
            'provider_key' => 'mock',
            'name' => 'Mock AI',
            'base_url' => null,
            'models' => ['mock-correction-v1'],
            'default_model' => 'mock-correction-v1',
        ],
        [
            'provider_key' => 'openai',
            'name' => 'OpenAI',
            'base_url' => 'https://api.openai.com/v1',
            'models' => ['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini'],
            'default_model' => 'gpt-5-mini',
        ],
        [
            'provider_key' => 'anthropic',
            'name' => 'Anthropic',
            'base_url' => 'https://api.anthropic.com',
            'models' => ['claude-sonnet-4', 'claude-haiku-3.5'],
            'default_model' => 'claude-sonnet-4',
        ],
        [
            'provider_key' => 'google',
            'name' => 'Google Gemini',
            'base_url' => 'https://generativelanguage.googleapis.com',
            'models' => ['gemini-2.5-flash', 'gemini-2.5-pro'],
            'default_model' => 'gemini-2.5-flash',
        ],
        [
            'provider_key' => 'openrouter',
            'name' => 'OpenRouter',
            'base_url' => 'https://openrouter.ai/api/v1',
            'models' => ['openai/gpt-5-mini', 'anthropic/claude-sonnet-4'],
            'default_model' => 'openai/gpt-5-mini',
        ],
        [
            'provider_key' => 'ollama',
            'name' => 'Ollama',
            'base_url' => 'http://127.0.0.1:11434',
            'models' => ['llama3.1', 'mistral', 'qwen2.5'],
            'default_model' => 'llama3.1',
        ],
    ],
];
