import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';

const bundled = await build({
    stdin: {
        contents: `
            export { optimizeLargeEditorTokenCaches } from './src/components/utils/largeEditorTokenCaches';
            export { isChunkedArray } from './src/components/utils/chunkedArray';
            export { FixedArray } from 'monaco-editor/esm/vs/editor/common/model/fixedArray.js';
            export { ContiguousTokensStore } from 'monaco-editor/esm/vs/editor/common/tokens/contiguousTokensStore.js';`,
        resolveDir: process.cwd(),
    },
    bundle: true, platform: 'node', format: 'cjs', write: false,
});
const module = { exports: {} };
runInNewContext(bundled.outputFiles[0].text, { module, exports: module.exports });
const { optimizeLargeEditorTokenCaches, isChunkedArray, FixedArray, ContiguousTokensStore } = module.exports;

const makeFixture = (fallback = null) => {
    const tokens = new ContiguousTokensStore({ encodeLanguageId: () => 1 });
    const states = new FixedArray(fallback);
    const grammar = { _tokens: tokens, _tokenizer: { store: { _tokenizationStateStore: { _lineEndStates: states } } } };
    const adapted = new WeakSet();
    return { tokens, states, grammar, adapted };
};

const countWrites = (values) => {
    let writes = 0;
    return {
        array: new Proxy(values, { set(target, key, value) { writes++; return Reflect.set(target, key, value); } }),
        get: () => writes,
    };
};

test('first visible token near the millionth line fills the gap in one bulk write', () => {
    const native = makeFixture(), optimized = makeFixture();
    for (const fixture of [native, optimized]) fixture.tokens.setTokens('json', 2, 5, new Uint32Array([5, 123]), false);
    optimizeLargeEditorTokenCaches(optimized.grammar, optimized.adapted);
    const writes = countWrites(optimized.tokens._lineTokens);
    optimized.tokens._lineTokens = writes.array;
    const target = 1025567;
    native.tokens._ensureLine(target); optimized.tokens._ensureLine(target);
    assert.equal(writes.get(), 1, 'one length expansion replaces a million indexed assignments');
    assert.equal(optimized.tokens._len, 1025568);
    assert.equal(optimized.tokens._lineTokens.length, native.tokens._lineTokens.length);
    for (let i = 0; i <= target; i++) assert.equal(optimized.tokens._lineTokens[i], i === 2 ? optimized.tokens._lineTokens[2] : native.tokens._lineTokens[i]);
    assert.deepEqual(Array.from(new Uint32Array(optimized.tokens._lineTokens[2])), Array.from(new Uint32Array(native.tokens._lineTokens[2])));
    native.tokens.setTokens('json', target, 7, new Uint32Array([7, 321]), true);
    optimized.tokens.setTokens('json', target, 7, new Uint32Array([7, 321]), true);
    assert.deepEqual(Array.from(new Uint32Array(optimized.tokens._lineTokens[target])), Array.from(new Uint32Array(native.tokens._lineTokens[target])));
    const before = writes.get(); optimized.tokens._ensureLine(4);
    assert.equal(writes.get(), before, 'an existing line neither grows nor overwrites tokens');
});

test('far-away token states preserve a non-null default without per-line proxy writes', () => {
    const fallback = { kind: 'default' }, first = { kind: 'first' }, last = { kind: 'last' };
    const native = makeFixture(fallback), optimized = makeFixture(fallback);
    for (const fixture of [native, optimized]) fixture.states.set(2, first);
    optimizeLargeEditorTokenCaches(optimized.grammar, optimized.adapted);
    const writes = countWrites(optimized.states._store); optimized.states._store = writes.array;
    const target = 1025568;
    native.states.set(target, last); optimized.states.set(target, last);
    assert.equal(writes.get(), 1, 'the target assignment grows the default-filled gap in bulk');
    assert.equal(optimized.states._store.length, native.states._store.length);
    for (let i = 0; i <= target; i++) assert.equal(optimized.states.get(i), native.states.get(i));
    assert.equal(optimized.states.get(target + 1), fallback);
    optimized.states.set(2, last); native.states.set(2, last);
    assert.equal(optimized.states.get(2), native.states.get(2));
});

test('flush and large native insertions can replace arrays and then be adapted again', () => {
    const native = makeFixture(), optimized = makeFixture();
    optimizeLargeEditorTokenCaches(optimized.grammar, optimized.adapted);
    const ensure = optimized.tokens._ensureLine, set = optimized.states.set;
    for (const fixture of [native, optimized]) {
        fixture.tokens._ensureLine(10); fixture.tokens._insertLines(4, 8193);
        fixture.states.set(10, 'saved'); fixture.states.replace(4, 2, 8193);
    }
    assert.equal(isChunkedArray(optimized.tokens._lineTokens), false);
    assert.equal(isChunkedArray(optimized.states._store), false);
    for (const fixture of [native, optimized]) { fixture.tokens._ensureLine(9000); fixture.states.set(9000, 'later'); }
    assert.deepEqual(Array.from(optimized.tokens._lineTokens), Array.from(native.tokens._lineTokens));
    assert.deepEqual(Array.from(optimized.states._store), Array.from(native.states._store));
    optimizeLargeEditorTokenCaches(optimized.grammar, optimized.adapted);
    assert.ok(isChunkedArray(optimized.tokens._lineTokens)); assert.ok(isChunkedArray(optimized.states._store));
    assert.equal(optimized.tokens._ensureLine, ensure); assert.equal(optimized.states.set, set);
    for (const fixture of [native, optimized]) fixture.tokens.flush();
    assert.equal(isChunkedArray(optimized.tokens._lineTokens), false);
    for (const fixture of [native, optimized]) fixture.tokens._ensureLine(7);
    assert.deepEqual(Array.from(optimized.tokens._lineTokens), Array.from(native.tokens._lineTokens));
    optimizeLargeEditorTokenCaches(optimized.grammar, optimized.adapted);
    const writes = countWrites(optimized.tokens._lineTokens); optimized.tokens._lineTokens = writes.array;
    native.tokens._ensureLine(1025567); optimized.tokens._ensureLine(1025567);
    assert.equal(writes.get(), 1); assert.equal(optimized.tokens._len, native.tokens._len);
    assert.equal(optimized.tokens._ensureLine, ensure);
});

test('local insertion, removal and replacement preserve native cache contents after growth', () => {
    const fallback = { kind: 'default' }, saved = { kind: 'saved' };
    const native = makeFixture(fallback), optimized = makeFixture(fallback);
    for (const fixture of [native, optimized]) { fixture.tokens._ensureLine(5000); fixture.states.set(5000, saved); }
    optimizeLargeEditorTokenCaches(optimized.grammar, optimized.adapted);
    for (const [at, removed, added] of [[1, 0, 3], [1024, 20, 2], [4500, 1, 0], [100, 2, 8193], [0, 20000, 0]]) {
        for (const fixture of [native, optimized]) fixture.states.replace(at, removed, added);
        assert.deepEqual(Array.from(optimized.states._store), Array.from(native.states._store));
        optimizeLargeEditorTokenCaches(optimized.grammar, optimized.adapted);
    }
    for (const [at, count] of [[1, 0], [1024, 3], [4500, 8193]]) {
        for (const fixture of [native, optimized]) fixture.tokens._insertLines(at, count);
        assert.deepEqual(Array.from(optimized.tokens._lineTokens), Array.from(native.tokens._lineTokens));
        assert.equal(optimized.tokens._len, native.tokens._len);
        optimizeLargeEditorTokenCaches(optimized.grammar, optimized.adapted);
    }
});

test('unknown internal cache layouts are left on Monaco native behavior', () => {
    const values = [1, 2, 3], set = () => {}, replace = () => {}, insert = () => {};
    const grammar = { _tokens: { _lineTokens: values, _len: 3, _insertLines: insert },
        _tokenizer: { store: { _tokenizationStateStore: { _lineEndStates: { _store: values, set, replace, insert } } } } };
    optimizeLargeEditorTokenCaches(grammar, new WeakSet());
    assert.equal(grammar._tokens._lineTokens, values);
    assert.equal(grammar._tokenizer.store._tokenizationStateStore._lineEndStates._store, values);
    assert.equal(grammar._tokenizer.store._tokenizationStateStore._lineEndStates.set, set);
});
