import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { load as loadYaml } from 'js-yaml';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'json-tool-test-'));
const bundle = path.join(directory, 'core.mjs');
await build({
    stdin: {
        contents: `export * from './src/components/JsonTool/utils/jsonEngine/index.ts';
export * from './src/components/JsonTool/utils/jsonSort.ts';
export * from './src/components/JsonTool/utils/jsonConvert.ts';
export * from './src/components/JsonTool/utils/diffEngine.ts';`,
        resolveDir: process.cwd(), loader: 'ts',
    },
    bundle: true, platform: 'browser', format: 'esm', outfile: bundle,
});
const engine = await import(pathToFileURL(bundle));
after(() => fs.rm(directory, { recursive: true, force: true }));
const options = { indentSize: 2, arrayNewLine: true, preserveNumberLiterals: true, encodingMode: false };

test('formatting and compression preserve long integers, decimals and exponent literals', () => {
    const input = '{"id":900719925474099312345,"amount":1.234567890123456789,"exp":1e+30,"items":[1,2]}';
    const formatted = engine.formatJsonInput(input, options);
    assert.match(formatted.formatted, /900719925474099312345/);
    assert.match(formatted.formatted, /1\.234567890123456789/);
    assert.match(formatted.formatted, /1e\+30/);
    const compressed = engine.compressJsonInput(formatted.formatted, options);
    assert.equal(compressed.formatted, input);
});

test('JSON5 input is accepted and invalid JSON reports an error', () => {
    const formatted = engine.formatJsonInput("{name:'demo', items:[1,2,], /* comment */ enabled:true}", options);
    assert.deepEqual(JSON.parse(formatted.formatted), { name: 'demo', items: [1, 2], enabled: true });
    assert.throws(() => engine.formatJsonInput('{"broken":', options));
});

test('dictionary sorting recurses through objects and sorting by field orders records', () => {
    assert.deepEqual(Object.keys(engine.sortJsonObject({ z: 1, a: { y: 2, b: 3 } }, 'dictionary', 'asc')), ['a', 'z']);
    assert.deepEqual(Object.keys(engine.sortJsonObject({ a: { y: 2, b: 3 } }, 'dictionary', 'asc').a), ['b', 'y']);
    const records = [{ item: { rank: 3 } }, { item: { rank: 1 } }, { item: { rank: 2 } }];
    assert.deepEqual(engine.sortJsonByField(records, 'item.rank').map((row) => row.item.rank), [1, 2, 3]);
});

test('conversion produces YAML, XML, TOML, Go and TypeScript locally', async () => {
    const data = { name: 'demo', count: 2, enabled: true };
    assert.deepEqual(loadYaml(await engine.convertToYAML(data)), data);
    const available = Object.keys(engine).filter((name) => /^convertTo/.test(name));
    assert.ok(available.length >= 5);
    for (const name of available.filter((name) => /(?:XML|TOML|Go|TypeScript)/i.test(name))) {
        const output = await engine[name](data);
        assert.equal(typeof output, 'string', `${name} must return text`);
        assert.ok(output.length > 0, `${name} must produce nonempty output`);
    }
});

test('diff finds changed lines and ignores matching lines', () => {
    assert.deepEqual(engine.computeLineDiff(['same'], ['same']), []);
    const changes = engine.computeLineDiff(['{"count":1}'], ['{"count":2}']);
    assert.equal(changes.length, 1);
    const inline = engine.computeInlineDiff('count:1', 'count:2');
    assert.deepEqual(inline.leftSegments, [{ startCol: 7, endCol: 8 }]);
    assert.deepEqual(inline.rightSegments, [{ startCol: 7, endCol: 8 }]);
});
