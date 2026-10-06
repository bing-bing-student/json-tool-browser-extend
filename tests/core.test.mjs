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
        contents: `export * from './src/components/utils/jsonEngine/index.ts';
export * from './src/components/utils/jsonSort.ts';
export * from './src/components/utils/jsonConvert.ts';
export * from './src/components/utils/diffEngine.ts';`,
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

test('YAML conversion preserves nested JSON values and strings that resemble YAML syntax', async () => {
    const data = JSON.parse(`{
        "strings": ["true", "false", "null", "0123", "2026-10-07", "a: b", "# comment", "line\\nnext"],
        "nested": [{"enabled": true, "empty": null, "count": 2}, {}, []],
        "__proto__": {"safe": "local value"},
        "<<": "literal key"
    }`);
    assert.deepEqual(loadYaml(await engine.convertToYAML(data)), data);
});

test('diff finds changed lines and ignores matching lines', () => {
    assert.deepEqual(engine.computeLineDiff(['same'], ['same']), []);
    const changes = engine.computeLineDiff(['{"count":1}'], ['{"count":2}']);
    assert.equal(changes.length, 1);
    const inline = engine.computeInlineDiff('count:1', 'count:2');
    assert.deepEqual(inline.leftSegments, [{ startCol: 7, endCol: 8 }]);
    assert.deepEqual(inline.rightSegments, [{ startCol: 7, endCol: 8 }]);
});

const singleLineChange = [{
    originalStartLineNumber: 1,
    originalEndLineNumber: 1,
    modifiedStartLineNumber: 1,
    modifiedEndLineNumber: 1,
}];

test('diff preserves whitespace changes inside JSON strings and keys', () => {
    const pairs = [
        ['{"name":"a b"}', '{"name":"a  b"}'],
        ['{"name":" a"}', '{"name":"  a"}'],
        ['{"name":"a "}', '{"name":"a  "}'],
        ['{"first name":1}', '{"first  name":1}'],
        ['" "', '"  "'],
        [JSON.stringify({ name: 'a b' }), JSON.stringify({ name: 'a\u00a0b' })],
    ];
    for (const [left, right] of pairs) {
        assert.deepEqual(engine.computeLineDiff([left], [right]), singleLineChange, `${left} versus ${right}`);
    }
});

test('diff preserves string boundaries around escaped quotes and backslashes', () => {
    const pairs = [
        [JSON.stringify({ name: 'a" b' }), JSON.stringify({ name: 'a"  b' })],
        [JSON.stringify({ name: 'a\\" b' }), JSON.stringify({ name: 'a\\"  b' })],
        [JSON.stringify({ path: 'C:\\', name: 'a b' }), JSON.stringify({ path: 'C:\\', name: 'a  b' })],
    ];
    for (const [left, right] of pairs) {
        assert.deepEqual(engine.computeLineDiff([left], [right]), singleLineChange);
    }
    assert.deepEqual(engine.computeLineDiff(
        [String.raw`{"path":"C:\\",  "name": "same"}`],
        [String.raw`{"path":"C:\\", "name": "same"}`],
    ), []);
});

test('diff keeps the existing normalization of whitespace outside strings', () => {
    assert.deepEqual(engine.computeLineDiff(
        ['{', '  "name":   "a  b",', '  "items": [1,   2]', '}'],
        ['\t{  ', '\t"name": "a  b",\t', '\t"items": [1, 2] ', ' }'],
    ), []);
    assert.deepEqual(engine.computeLineDiff(['\t  '], ['']), []);
});

test('diff handles JSON5 single quoted strings and escaped single quotes', () => {
    assert.deepEqual(engine.computeLineDiff(["{name:'a b'}"], ["{name:'a  b'}"]), singleLineChange);
    assert.deepEqual(engine.computeLineDiff(
        [String.raw`{name:'a\' b'}`],
        [String.raw`{name:'a\'  b'}`],
    ), singleLineChange);
});

test('comment quotes do not change string state on following JSON5 lines', () => {
    assert.deepEqual(engine.computeLineDiff(
        ['{', '// a "quote', '  "name": "same"', '}'],
        ['{', '// a "quote', '\t"name": "same"', '}'],
    ), []);
    assert.deepEqual(engine.computeLineDiff(
        ['{', '/* a "quote', '  inside comment */', '  "name": "same"', '}'],
        ['{', '/* a "quote', '\tinside comment */', '\t"name": "same"', '}'],
    ), []);
});

test('diff preserves whitespace in JSON5 line continued strings', () => {
    const left = ['{', "  name: 'a\\", " b'", '}'];
    const right = ['{', "  name: 'a\\", "  b'", '}'];
    assert.deepEqual(engine.computeLineDiff(left, right), [{
        originalStartLineNumber: 3,
        originalEndLineNumber: 3,
        modifiedStartLineNumber: 3,
        modifiedEndLineNumber: 3,
    }]);
    assert.deepEqual(engine.computeLineDiff(left, left), []);
});

test('diff detects whitespace while a string is still being edited', () => {
    assert.deepEqual(engine.computeLineDiff(['{"name":"a '], ['{"name":"a  ']), singleLineChange);
});

test('diff returns original line and column positions for an added string space', () => {
    const left = '{"name":"a b"}';
    const right = '{"name":"a  b"}';
    assert.deepEqual(engine.computeLineDiff(['{', `  ${left}`, '}'], ['{', `  ${right}`, '}']), [{
        originalStartLineNumber: 2,
        originalEndLineNumber: 2,
        modifiedStartLineNumber: 2,
        modifiedEndLineNumber: 2,
    }]);
    const inline = engine.computeInlineDiff(left, right);
    assert.deepEqual(inline.leftSegments, []);
    assert.equal(inline.rightSegments.length, 1);
    const segment = inline.rightSegments[0];
    assert.equal(right.slice(segment.startCol - 1, segment.endCol - 1), ' ');
});
