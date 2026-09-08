import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import { bunny } from 'laravel-vite-plugin/fonts';

export default defineConfig({
    build: {
        // CMSwift is the shared dashboard runtime. Route pages are loaded on
        // demand, so keep the warning focused on chunks that exceed this core.
        chunkSizeWarningLimit: 550,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('/node_modules/cmswift/')) return 'cmswift';
                    if (id.includes('/node_modules/@tiptap/')) return 'tiptap';
                },
            },
        },
    },
    plugins: [
        laravel({
            input: [
                'resources/css/app.css',
                'resources/js/app.js',
                'resources/css/dashboard.css',
                'resources/css/bookEditor.css',
                'resources/js/dashboard.js',
            ],
            refresh: true,
            fonts: [
                bunny('Instrument Sans', {
                    weights: [400, 500, 600],
                }),
            ],
        }),
    ],
    server: {
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
    },
});
