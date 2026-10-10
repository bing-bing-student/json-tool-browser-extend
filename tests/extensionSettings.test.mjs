import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { build } from 'esbuild';
import { effectScope, nextTick } from 'vue';

const bundle = await build({
    entryPoints: ['src/components/composables/useToolSettings.ts'],
    bundle: true, write: false, format: 'esm', platform: 'node', external: ['vue'],
});
// Import Vue from this project's installation so the composable shares its effect scope.
const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
const { join } = await import('node:path');
const directory = await mkdtemp(join(process.cwd(), 'node_modules', '.extension-settings-test-'));
const filename = join(directory, 'settings.mjs');
await writeFile(filename, bundle.outputFiles[0].text);
const { useToolSettings } = await import(filename);
after(() => rm(directory, { recursive: true, force: true }));

async function withSettings(saved, action) {
    const previousWindow = globalThis.window;
    const previousStorage = globalThis.localStorage;
    const values = new Map(saved ? [['json-tool-settings', JSON.stringify(saved)]] : []);
    globalThis.window = {};
    globalThis.localStorage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
    };
    const scope = effectScope();
    try {
        const settings = scope.run(() => useToolSettings());
        await action(settings, values);
    } finally {
        scope.stop();
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
        if (previousStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previousStorage;
    }
}

test('extension update preserves older preferences and starts with repair disabled', async () => {
    await withSettings({
        fontSize: 15, indentSize: 4, wordWrap: false, themeMode: 'dark', sortMethod: 'length',
        buttonVisibility: { compress: false, fetchJson: true, share: true, fullscreen: true },
        defaultFullscreen: true,
    }, async (settings, values) => {
        assert.equal(settings.repairOnFormat.value, false);
        assert.equal(settings.fontSize.value, 15);
        assert.equal(settings.indentSize.value, 4);
        assert.equal(settings.wordWrap.value, false);
        assert.equal(settings.themeMode.value, 'dark');
        assert.equal(settings.sortMethod.value, 'length');
        assert.equal(settings.buttonVisibility.value.compress, false);
        settings.markInitialized();
        settings.repairOnFormat.value = true;
        await nextTick();
        const persisted = JSON.parse(values.get('json-tool-settings'));
        assert.equal(persisted.repairOnFormat, true);
        assert.equal(persisted.fontSize, 15);
        assert.equal(persisted.indentSize, 4);
        assert.equal(persisted.themeMode, 'dark');
        assert.equal(persisted.buttonVisibility.compress, false);
        for (const name of ['fetchJson', 'share', 'fullscreen']) {
            assert.equal(Object.hasOwn(persisted.buttonVisibility, name), false);
        }
        assert.equal(Object.hasOwn(persisted, 'defaultFullscreen'), false);
    });
});

test('extension restores a saved repair preference without altering unrelated settings', async () => {
    await withSettings({ repairOnFormat: true, fontSize: 13, arrayNewLine: false }, async (settings, values) => {
        assert.equal(settings.repairOnFormat.value, true);
        settings.markInitialized();
        settings.repairOnFormat.value = false;
        await nextTick();
        const persisted = JSON.parse(values.get('json-tool-settings'));
        assert.equal(persisted.repairOnFormat, false);
        assert.equal(persisted.fontSize, 13);
        assert.equal(persisted.arrayNewLine, false);
    });
});
