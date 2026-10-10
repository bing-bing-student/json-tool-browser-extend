import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { getJsonToolManualChunk } from './scripts/vite/monaco-chunks.mjs';
import { monacoLargeFoldingPlugin } from './scripts/vite/monaco-large-folding.mjs';

export default defineConfig({
    base: './',
    plugins: [vue(), monacoLargeFoldingPlugin()],
    resolve: {
        alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
        dedupe: ['vue'],
    },
    // Keep Monaco's original ESM modules available to the large-folding patch.
    optimizeDeps: { exclude: ['monaco-editor'] },
    worker: { format: 'es' },
    build: {
        target: 'es2022',
        assetsInlineLimit: 0,
        chunkSizeWarningLimit: 1800,
        rollupOptions: {
            output: {
                manualChunks: getJsonToolManualChunk,
            },
        },
    },
});

