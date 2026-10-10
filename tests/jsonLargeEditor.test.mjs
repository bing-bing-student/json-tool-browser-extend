import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { ChunkedLineSums } from '../src/components/utils/chunkedLineSums.ts';
import { getChangedLineRanges } from '../src/components/utils/changedLineRanges.ts';
import { getVisibleLineRuns } from '../src/components/utils/visibleLineRuns.ts';
import { optimizeLargeEditorFolding } from '../src/components/utils/largeEditorFolding.ts';
import { createChunkedArray, isChunkedArray } from '../src/components/utils/chunkedArray.ts';

const verify = (index, values) => {
    let sum = 0;
    assert.equal(index.getPrefixSum(0), 0);
    values.forEach((value, i) => {
        for (let j = 0; j < value; j++) assert.deepEqual(index.getIndexOf(sum + j), { index: i, remainder: j });
        sum += value;
        assert.equal(index.getPrefixSum(i + 1), sum);
    });
    assert.equal(index.getTotalSum(), sum);
};

test('line mapping skips folded rows and resolves wrapped rows across block boundaries', () => {
    const values = Array.from({ length: 4097 }, (_, i) => i % 23 === 0 ? 4 : i % 3 === 0 ? 1 : 0);
    verify(new ChunkedLineSums(values), values);
    verify(new ChunkedLineSums([]), []);
    verify(new ChunkedLineSums(Array(2049).fill(0)), Array(2049).fill(0));
});

test('insert, delete, fold and unfold stay correct after mixed edits', () => {
    let seed = 123456;
    const random = (max) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
    const values = Array.from({ length: 3000 }, () => random(4));
    const index = new ChunkedLineSums(values);
    for (let iteration = 0; iteration < 240; iteration++) {
        const at = random(values.length + 1);
        if (iteration % 3 === 0) {
            const inserted = Array.from({ length: random(50) + 1 }, () => random(4));
            values.splice(at, 0, ...inserted); index.insertValues(at, inserted);
        } else if (iteration % 3 === 1) {
            const count = random(60); values.splice(at, count); index.removeValues(at, count);
        } else if (at < values.length) {
            const value = random(4); values[at] = value; index.setValue(at, value);
        }
        verify(index, values);
    }
});

test('start, boundary, append, whole-document deletion and rebuilding an empty document', () => {
    const values = Array(2048).fill(1);
    const index = new ChunkedLineSums(values);
    for (const at of [0, 1024, values.length]) {
        values.splice(at, 0, 0, 3, 1); index.insertValues(at, [0, 3, 1]);
        verify(index, values);
    }
    index.removeValues(0, values.length + 100);
    verify(index, []);
    index.insertValues(0, [0, 2, 0, 1]); verify(index, [0, 2, 0, 1]);
});

test('million folded rows can be expanded, edited and collapsed without rebuilding a reverse index', () => {
    const count = 1025568;
    const index = new ChunkedLineSums(Array(count).fill(0));
    for (let i = 0; i < count; i++) if (i % 40 === 0) index.setValue(i, 1);
    assert.equal(index.getTotalSum(), Math.ceil(count / 40));
    assert.deepEqual(index.getIndexOf(1000), { index: 40000, remainder: 0 });
    index.insertValues(169, [1]);
    assert.deepEqual(index.getIndexOf(5), { index: 169, remainder: 0 });
    assert.deepEqual(index.getIndexOf(1001), { index: 40001, remainder: 0 });
    index.removeValues(169, 1);
    assert.deepEqual(index.getIndexOf(1000), { index: 40000, remainder: 0 });
    for (let i = 0; i < count; i++) index.setValue(i, 1);
    assert.equal(index.getTotalSum(), count);
    assert.deepEqual(index.getIndexOf(count - 1), { index: count - 1, remainder: 0 });
});

const change = (start, end, text, column = 1) => ({ range: { startLineNumber: start, endLineNumber: end, startColumn: column }, text });

test('ordinary typing scans only nearby new lines and handles all newline forms', () => {
    assert.deepEqual(getChangedLineRanges([change(500000, 500000, 'x')], 1000000), [{ start: 499999, end: 500001 }]);
    assert.deepEqual(getChangedLineRanges([change(10, 10, 'a\r\nb\rc\nd')], 100), [{ start: 9, end: 14 }]);
    assert.deepEqual(getChangedLineRanges([change(1, 1, '\n')], 2), [{ start: 1, end: 2 }]);
    assert.deepEqual(getChangedLineRanges([], 1), []);
});

test('multi-cursor edits account for preceding insertions and deletions', () => {
    assert.deepEqual(getChangedLineRanges([change(100, 100, 'x'), change(10, 12, ''), change(4, 4, '\n\n\n')], 200), [
        { start: 3, end: 8 }, { start: 12, end: 14 }, { start: 100, end: 102 },
    ]);
    assert.deepEqual(getChangedLineRanges([change(10, 10, '\n'), change(10, 10, 'a', 8)], 20), [{ start: 9, end: 12 }]);
    assert.deepEqual(getChangedLineRanges([change(2, 1000000, '')], 2), [{ start: 1, end: 2 }]);
});

test('visible ranges preserve wrapped rows and skip arbitrarily large folded gaps', () => {
    const rows = [1, 1, 1, 2, 500000, 500001, 500001, 1025568];
    assert.deepEqual(getVisibleLineRuns(1, 8, (line) => rows[line - 1]), [
        { start: 1, end: 2 }, { start: 500000, end: 500001 }, { start: 1025568, end: 1025568 },
    ]);
});

test('guarded adapters match the installed Monaco operations for folds, tokens, states and visibility', async () => {
    const bundled = await build({ stdin: { contents: `
        export { optimizeLargeEditorLineMapping } from './src/components/utils/largeEditorLineMapping';
        export { ConstantTimePrefixSumComputer } from 'monaco-editor/esm/vs/editor/common/model/prefixSumComputer.js';
        export { FixedArray } from 'monaco-editor/esm/vs/editor/common/model/fixedArray.js';
        export { ContiguousTokensStore } from 'monaco-editor/esm/vs/editor/common/tokens/contiguousTokensStore.js';
        export { createModelLineProjection } from 'monaco-editor/esm/vs/editor/common/viewModel/modelLineProjection.js';
        export { ViewLinesInsertedEvent } from 'monaco-editor/esm/vs/editor/common/viewEvents.js';
        export { Range } from 'monaco-editor/esm/vs/editor/common/core/range.js';`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', write: false });
    const module = { exports: {} };
    runInNewContext(bundled.outputFiles[0].text, { module, exports: module.exports, queueMicrotask });
    const api = module.exports;
    const source = await readFile('node_modules/monaco-editor/esm/vs/editor/common/viewModel/viewModelLines.js', 'utf8');
    const insertMethod = source.slice(source.indexOf('    onModelLinesInserted(versionId'), source.indexOf('    onModelLineChanged(versionId'));
    const viewSource = await readFile('node_modules/monaco-editor/esm/vs/editor/common/viewModel/viewModelImpl.js', 'utf8');
    const visibleMethod = viewSource.slice(viewSource.indexOf('    _toModelVisibleRanges(visibleViewRange)'), viewSource.indexOf('    getCompletelyVisibleViewRange()'));
    const nativeInsert = runInNewContext(`({${insertMethod}}).onModelLinesInserted`, { createModelLineProjection: api.createModelLineProjection, viewEvents: api });
    const nativeVisible = runInNewContext(`({${visibleMethod}})._toModelVisibleRanges`, { Range: api.Range });
    const makeFixture = () => {
        const values = Array.from({ length: 6000 }, (_, i) => i > 1 && i < 2000 || i > 4000 && i < 5000 ? 0 : 1);
        const lines = {
            projectedModelLineLineCounts: new api.ConstantTimePrefixSumComputer(values), _validModelVersionId: 0, hiddenAreasDecorationIds: ['a', 'b'],
            modelLineProjections: values.map((v) => api.createModelLineProjection(null, !!v)), onModelLinesInserted: nativeInsert,
            getHiddenAreas() {
                const ranges = []; let start = null;
                this.modelLineProjections.forEach((p, i) => {
                    if (!p.isVisible() && start === null) start = i + 1;
                    if (p.isVisible() && start !== null) { ranges.push({ startLineNumber: start, endLineNumber: i }); start = null; }
                });
                if (start !== null) ranges.push({ startLineNumber: start, endLineNumber: this.modelLineProjections.length });
                return ranges;
            },
        };
        const states = new api.FixedArray(null); states._store = Array.from({ length: 6000 }, (_, i) => i);
        const tokens = new api.ContiguousTokensStore({}); tokens._len = 6000; tokens._lineTokens = states._store.slice();
        const model = { getLineCount: () => 300000, isDisposed: () => false, getLineMaxColumn: () => 21,
            tokenization: { _tokens: { _tokens: tokens, _tokenizer: { store: { _tokenizationStateStore: { _lineEndStates: states } } } } } };
        const view = { _lines: lines, model, _toModelVisibleRanges: nativeVisible, coordinatesConverter: {
            convertViewRangeToModelRange: (r) => new api.Range(lines.projectedModelLineLineCounts.getIndexOf(r.startLineNumber - 1).index + 1, r.startColumn,
                lines.projectedModelLineLineCounts.getIndexOf(r.endLineNumber - 1).index + 1, r.endColumn),
        } };
        const noop = () => ({ dispose() {} });
        const editor = { getModel: () => model, _modelData: { viewModel: view }, onDidChangeModel: noop, onDidChangeModelContent: noop,
            onDidChangeConfiguration: noop, onDidLayoutChange: noop, onDidDispose: noop, getContribution: () => null };
        return { lines, states, tokens, view, editor };
    };
    const original = makeFixture(), optimized = makeFixture();
    api.optimizeLargeEditorLineMapping(optimized.editor);
    await new Promise(queueMicrotask);
    for (const at of [1, 10, 2100, 4500, 6000]) {
        const before = original.lines.onModelLinesInserted(1, at, at + 1, [null, null]);
        const after = optimized.lines.onModelLinesInserted(1, at, at + 1, [null, null]);
        assert.equal(after.fromLineNumber, before.fromLineNumber); assert.equal(after.toLineNumber, before.toLineNumber);
        assert.equal(optimized.lines.projectedModelLineLineCounts.getTotalSum(), original.lines.projectedModelLineLineCounts.getTotalSum());
        assert.deepEqual(optimized.lines.modelLineProjections.map((p) => p.isVisible()), original.lines.modelLineProjections.map((p) => p.isVisible()));
    }
    for (const range of [new api.Range(1, 1, 20, 21), new api.Range(800, 4, 900, 15), new api.Range(2, 1, 2, 1)]) {
        const plain = (ranges) => JSON.parse(JSON.stringify(ranges));
        assert.deepEqual(plain(optimized.view._toModelVisibleRanges(range)), plain(original.view._toModelVisibleRanges(range)));
    }
    for (const [at, removed, added] of [[0, 1, 2], [1024, 20, 3], [5000, 0, 40], [7000, 0, 2], [0, 6000, 0], [0, 0, 5]]) {
        original.states.replace(at, removed, added); optimized.states.replace(at, removed, added);
        assert.deepEqual(Array.from(optimized.states._store), Array.from(original.states._store));
    }
    for (const [at, count] of [[0, 1], [100, 0], [1500, 40], [5000, 8500]]) {
        original.tokens._insertLines(at, count); optimized.tokens._insertLines(at, count);
        assert.deepEqual(Array.from(optimized.tokens._lineTokens), Array.from(original.tokens._lineTokens)); assert.equal(optimized.tokens._len, original.tokens._len);
    }
});

test('chunked token cache preserves dense array reads, writes, splices, snapshots and append behavior', () => {
    const expected = Array.from({ length: 4097 }, (_, i) => ({ id: i }));
    const actual = createChunkedArray(expected, null);
    assert.ok(Array.isArray(actual)); assert.ok(isChunkedArray(actual));
    let seed = 6789;
    const random = (max) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
    for (let i = 0; i < 120; i++) {
        const at = random(expected.length + 1), removed = random(60), added = Array.from({ length: random(40) }, () => ({ id: random(1000000) }));
        assert.deepEqual(actual.splice(at, removed, ...added), expected.splice(at, removed, ...added));
        actual.push(null); expected.push(null);
        const index = random(expected.length); actual[index] = { id: i }; expected[index] = actual[index];
        assert.equal(actual.length, expected.length);
        assert.deepEqual(Array.from(actual), expected);
        assert.deepEqual(actual.slice(-100, -3), expected.slice(-100, -3));
    }
    assert.deepEqual(actual.concat(['tail']), expected.concat(['tail']));
    assert.equal(JSON.stringify(actual), JSON.stringify(expected));
    actual.length = 0; assert.equal(actual.length, 0);
    actual.push({ id: 1 }); assert.deepEqual(Array.from(actual), [{ id: 1 }]);
});

test('fold decoration reuse matches native refresh after tracked ranges move and fold states change', async () => {
    const bundled = await build({ stdin: { contents: `
        export { FoldingModel } from 'monaco-editor/esm/vs/editor/contrib/folding/browser/foldingModel.js';
        export { FoldingRegions } from 'monaco-editor/esm/vs/editor/contrib/folding/browser/foldingRanges.js';`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', write: false });
    const module = { exports: {} };
    runInNewContext(bundled.outputFiles[0].text, { module, exports: module.exports });
    const { FoldingModel, FoldingRegions } = module.exports;
    const makeFixture = () => {
        const decorations = new Map(), options = new Map(); let id = 0, replaced = 0;
        const model = { getLineMaxColumn: () => 21, getDecorationRange: (id) => decorations.get(id)?.range,
            getDecorationOptions: (id) => decorations.get(id)?.options };
        const provider = {
            getDecorationOption(...args) {
                const key = args.join(':');
                if (!options.has(key)) options.set(key, { id: key });
                return options.get(key);
            },
            changeDecorations(callback) {
                callback({ deltaDecorations(removed, added) {
                    removed.forEach((id) => decorations.delete(id));
                    replaced += added.length;
                    return added.map((entry) => { const key = String(++id); decorations.set(key, { range: { ...entry.range, endColumn: Math.min(entry.range.endColumn, 21) }, options: entry.options }); return key; });
                } });
            },
        };
        return { folding: new FoldingModel(model, provider), decorations, count: () => replaced };
    };
    const original = makeFixture(), optimized = makeFixture();
    let ranges = [
        { startLineNumber: 1, endLineNumber: 100, isCollapsed: false, source: 0 },
        { startLineNumber: 2, endLineNumber: 40, isCollapsed: true, source: 0 },
        { startLineNumber: 3, endLineNumber: 10, isCollapsed: true, source: 1 },
        { startLineNumber: 50, endLineNumber: 80, isCollapsed: true, source: 0 },
    ];
    for (const fixture of [original, optimized]) fixture.folding.updatePost(FoldingRegions.fromFoldRanges(ranges));
    optimizeLargeEditorFolding(optimized.folding);
    for (const fixture of [original, optimized]) for (const entry of fixture.decorations.values()) { entry.range.startLineNumber++; entry.range.endLineNumber++; }
    ranges = ranges.map((range) => ({ ...range, startLineNumber: range.startLineNumber + 1, endLineNumber: range.endLineNumber + 1 }));
    const plain = (fixture) => fixture.folding._editorDecorationIds.map((id) => JSON.parse(JSON.stringify(fixture.decorations.get(id))));
    original.folding.updatePost(FoldingRegions.fromFoldRanges(ranges)); optimized.folding.updatePost(FoldingRegions.fromFoldRanges(ranges));
    assert.deepEqual(plain(optimized), plain(original));
    assert.equal(optimized.count(), 4, 'unchanged tracked decorations are retained');
    for (const next of [ranges.map((r, i) => i === 1 ? { ...r, isCollapsed: false } : r), ranges.slice(0, 3), ranges]) {
        original.folding.updatePost(FoldingRegions.fromFoldRanges(next)); optimized.folding.updatePost(FoldingRegions.fromFoldRanges(next));
        assert.deepEqual(plain(optimized), plain(original));
        assert.deepEqual(JSON.parse(JSON.stringify(optimized.folding.regions.toFoldRange(1))), JSON.parse(JSON.stringify(original.folding.regions.toFoldRange(1))));
    }
});
