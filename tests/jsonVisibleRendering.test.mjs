import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';

const bundled = await build({
    stdin: { contents: `
        export { optimizeLargeEditorVisibleRendering } from './src/components/utils/largeEditorVisibleRendering';
        export { ChunkedLineSums } from './src/components/utils/chunkedLineSums';
        export { createModelLineProjection } from 'monaco-editor/esm/vs/editor/common/viewModel/modelLineProjection.js';
        export { ModelLineProjectionData } from 'monaco-editor/esm/vs/editor/common/modelLineProjectionData.js';
        export { GuidesTextModelPart } from 'monaco-editor/esm/vs/editor/common/model/guidesTextModelPart.js';
        export { LineTokens } from 'monaco-editor/esm/vs/editor/common/tokens/lineTokens.js';
        export { Range } from 'monaco-editor/esm/vs/editor/common/core/range.js';
        export { Position } from 'monaco-editor/esm/vs/editor/common/core/position.js';`, resolveDir: process.cwd() },
    bundle: true, platform: 'node', format: 'cjs', write: false,
});
const module = { exports: {} };
runInNewContext(bundled.outputFiles[0].text, { module, exports: module.exports });
const api = module.exports;
const source = await readFile('node_modules/monaco-editor/esm/vs/editor/common/viewModel/viewModelLines.js', 'utf8');
const method = (name, next) => {
    const start = source.indexOf(`    ${name}(`), end = source.indexOf(`    ${next}(`, start);
    assert.ok(start >= 0 && end > start, `installed Monaco still defines ${name}`);
    return runInNewContext(`({${source.slice(start, end)}}).${name}`, api);
};
const native = {
    getViewLinesData: method('getViewLinesData', 'validateViewPosition'),
    getViewLinesIndentGuides: method('getViewLinesIndentGuides', 'getViewLineContent'),
    getDecorationsInRange: method('getDecorationsInRange', 'getInjectedTextAt'),
};
const plain = (value) => JSON.parse(JSON.stringify(value));

const fixture = (values, { wrapIndent = 0, offSide = false, contents = new Map(), decorations = [] } = {}) => {
    const counts = new api.ChunkedLineSums(values);
    let projectionReads = 0;
    const content = (line) => contents.get(line) ?? `${' '.repeat(line % 3 * 2)}${`line ${line} `.repeat(8)}`.padEnd(Math.max(1, values[line - 1]) * 18, 'x').slice(0, Math.max(1, values[line - 1]) * 18);
    const projections = values.map((count) => api.createModelLineProjection(count > 1
        ? new api.ModelLineProjectionData(null, null, Array.from({ length: count }, (_, i) => (i + 1) * 18), Array.from({ length: count }, (_, i) => (i + 1) * 18), wrapIndent)
        : null, count > 0));
    const queries = [], guideQueries = [];
    const model = {
        getLineCount: () => values.length,
        getLineContent: content,
        getLineMaxColumn: (line) => content(line).length + 1,
        getLineMinColumn: () => 1,
        getLineLength: (line) => content(line).length,
        getOptions: () => ({ tabSize: 4, indentSize: 2 }),
        getLanguageId: () => 'json',
        validatePosition: (position) => new api.Position(Math.min(values.length, Math.max(1, position.lineNumber)),
            Math.min(content(Math.min(values.length, Math.max(1, position.lineNumber))).length + 1, Math.max(1, position.column))),
        tokenization: { getLineTokens: (line) => api.LineTokens.createEmpty(content(line), { decodeLanguageId: () => 'json' }) },
        getDecorationsInRange(range, owner, validation, minimap, margin) {
            queries.push({ range: plain(range), owner, validation, minimap, margin, argumentCount: arguments.length });
            return decorations.filter((decoration) => (!owner || decoration.owner === owner)
                && (!validation || !decoration.validation) && (!minimap || decoration.minimap) && (!margin || decoration.margin)
                && api.Range.areIntersectingOrTouching(range, decoration.range));
        },
    };
    const guides = new api.GuidesTextModelPart(model, { getLanguageConfiguration: () => ({ foldingRules: { offSide } }) });
    model.guides = { getLinesIndentGuides(start, end) { guideQueries.push([start, end]); return guides.getLinesIndentGuides(start, end); } };
    const lines = {
        ...native,
        projectedModelLineLineCounts: counts,
        modelLineProjections: new Proxy(projections, { get(target, key, receiver) {
            if (typeof key === 'string' && /^\d+$/.test(key)) projectionReads++;
            return Reflect.get(target, key, receiver);
        } }),
        model,
        _toValidViewLineNumber: (line) => line < 1 ? 1 : line > counts.getTotalSum() ? counts.getTotalSum() : line | 0,
        getViewLineInfo(line) {
            const at = counts.getIndexOf(this._toValidViewLineNumber(line) - 1);
            return { modelLineNumber: at.index + 1, modelLineWrappedLineIdx: at.remainder };
        },
        getViewLineMinColumn(line) {
            const at = this.getViewLineInfo(line);
            return this.modelLineProjections[at.modelLineNumber - 1].getViewLineMinColumn(model, at.modelLineNumber, at.modelLineWrappedLineIdx);
        },
        getViewLineMaxColumn(line) {
            const at = this.getViewLineInfo(line);
            return this.modelLineProjections[at.modelLineNumber - 1].getViewLineMaxColumn(model, at.modelLineNumber, at.modelLineWrappedLineIdx);
        },
        convertViewPositionToModelPosition(line, column) {
            const at = this.getViewLineInfo(line);
            return model.validatePosition(new api.Position(at.modelLineNumber,
                this.modelLineProjections[at.modelLineNumber - 1].getModelColumnOfViewPosition(at.modelLineWrappedLineIdx, column)));
        },
    };
    return { lines, queries, guideQueries, reads: () => projectionReads, reset() { projectionReads = 0; queries.length = 0; guideQueries.length = 0; } };
};

const compare = (values, options, ranges) => {
    const before = fixture(values, options), after = fixture(values, options);
    api.optimizeLargeEditorVisibleRendering(after.lines);
    for (const [start, end] of ranges) {
        const needed = Array.from({ length: after.lines._toValidViewLineNumber(end) - after.lines._toValidViewLineNumber(start) + 1 }, (_, i) => i % 4 !== 2);
        before.reset(); after.reset();
        assert.deepEqual(plain(after.lines.getViewLinesData(start, end, needed)), plain(before.lines.getViewLinesData(start, end, needed)));
        assert.deepEqual(plain(after.lines.getViewLinesIndentGuides(start, end)), plain(before.lines.getViewLinesIndentGuides(start, end)));
        assert.deepEqual(after.guideQueries, before.guideQueries, 'indentation keeps the native full-model query boundaries');
        const range = new api.Range(start, 3, end, 7);
        for (const minimap of [false, true]) for (const margin of [false, true]) {
            before.queries.length = after.queries.length = 0;
            assert.deepEqual(plain(after.lines.getDecorationsInRange(range, 7, true, minimap, margin)), plain(before.lines.getDecorationsInRange(range, 7, true, minimap, margin)));
            assert.deepEqual(after.queries, before.queries, 'start/end columns and native filtering arguments stay identical');
        }
    }
    return { before, after };
};

test('viewport rendering crosses a million hidden lines without scanning their projections', () => {
    const readCounts = [];
    for (const hidden of [100, 1000000]) {
        const values = [...Array(6).fill(1), ...Array(hidden).fill(0), ...Array(6).fill(1)];
        const { before, after } = compare(values, {}, [[1, 12], [5, 8], [8, 11]]);
        const sample = [];
        for (const render of [
            (lines) => lines.getViewLinesData(1, 12, Array(12).fill(true)),
            (lines) => lines.getViewLinesIndentGuides(1, 12),
            (lines) => lines.getDecorationsInRange(new api.Range(1, 3, 12, 7), 7, true, false, false),
        ]) {
            before.reset(); after.reset(); render(before.lines); render(after.lines);
            assert.ok(before.reads() >= hidden, 'the native renderer visits the hidden model lines');
            assert.ok(after.reads() <= 24, 'the adapter visits only the visible projections');
            sample.push(after.reads());
        }
        readCounts.push(sample);
    }
    assert.deepEqual(readCounts[0], readCounts[1], 'data, indent and decoration work stay constant as the folded block grows');
});

test('multiple folded gaps and partial wrapped rows preserve data, needed flags and wrap blocking', () => {
    for (const wrapIndent of [0, 4]) {
        const values = [3, 2, 0, 0, 0, 1, 2, 0, 0, 3, 1];
        const total = values.reduce((sum, count) => sum + count, 0);
        compare(values, { wrapIndent }, [[1, total], [2, total - 1], [3, 8], [2, 2], [6, 6], [0, total + 5]]);
    }
});

test('mixed wrapped viewports match native rendering across 100 fold layouts', () => {
    for (let seed = 0; seed < 100; seed++) {
        const values = Array.from({ length: 150 }, (_, i) => i !== 0 && i !== 149 && (i * 7 + seed) % 17 < 10 ? 0 : 1 + (i + seed) % 3);
        const total = values.reduce((sum, count) => sum + count, 0);
        compare(values, { wrapIndent: seed % 2 * 4 }, [[1 + seed % 11, total - seed % 9]]);
    }
});

test('blank-line indent guides retain surrounding hidden-line context and off-side rules', () => {
    const values = [1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1];
    const contents = new Map([[1, 'root'], [2, '    '], [3, '    hidden child'], [4, '      deep'], [5, '  end'], [6, '  '], [7, '  visible'], [8, '    '], [9, 'nested'], [10, 'end'], [11, '    ']]);
    for (const offSide of [false, true]) compare(values, { contents, offSide }, [[1, 6], [2, 5]]);
});

test('cross-fold decoration queries preserve edge columns, ordering, deduplication and filters', () => {
    const values = [2, 1, 0, 0, 0, 1, 0, 0, 1, 2];
    const decoration = (id, startLine, startColumn, endLine, endColumn, extra = {}) => ({ id, owner: 7, range: new api.Range(startLine, startColumn, endLine, endColumn), ...extra });
    const decorations = [
        decoration('spanning', 1, 1, 10, 30, { minimap: true, margin: true }),
        decoration('before-start-column', 1, 1, 1, 2),
        decoration('hidden-only', 4, 1, 4, 18),
        decoration('z-tie', 6, 1, 6, 7), decoration('a-tie', 6, 1, 6, 7),
        decoration('validation', 6, 2, 6, 4, { validation: true }),
        decoration('other-owner', 9, 1, 9, 7, { owner: 2 }),
        decoration('after-end-column', 10, 35, 10, 36),
    ];
    const { after } = compare(values, { decorations }, [[1, 7], [2, 6], [4, 5], [1, 1]]);
    const result = after.lines.getDecorationsInRange(new api.Range(1, 3, 7, 7), 7, true, false, true);
    assert.equal(result.filter((entry) => entry.id === 'spanning').length, 1);
    assert.ok(!result.some((entry) => entry.id === 'hidden-only' || entry.id === 'before-start-column' || entry.id === 'after-end-column'));
    assert.deepEqual(plain(result.filter((entry) => entry.id.endsWith('-tie')).map((entry) => entry.id)), ['a-tie', 'z-tie']);
    assert.ok(result.some((entry) => entry.id === 'a-tie'), 'native cross-fold path intentionally omits its margin-only filter');
});

test('native decoration fast path is retained when wrapped rows outnumber a small hidden gap', () => {
    const values = [5, 0, 1];
    const decorations = [{ id: 'before-column', owner: 7, range: new api.Range(1, 1, 1, 2), margin: true }];
    const { after } = compare(values, { decorations }, [[1, 6]]);
    after.queries.length = 0;
    after.lines.getDecorationsInRange(new api.Range(1, 7, 6, 7), 7, false, false, true);
    assert.equal(after.queries.length, 1);
    assert.equal(after.queries[0].range.startColumn, 1);
    assert.equal(after.queries[0].argumentCount, 5);
    assert.equal(after.queries[0].margin, true);
});

test('unsupported internals and large non-viewport requests use the original methods', () => {
    const unsupported = fixture([1, 0, 1]);
    const counts = unsupported.lines.projectedModelLineLineCounts;
    unsupported.lines.projectedModelLineLineCounts = { getIndexOf: counts.getIndexOf.bind(counts) };
    api.optimizeLargeEditorVisibleRendering(unsupported.lines);
    assert.deepEqual(plain(unsupported.lines.getViewLinesData(1, 2, [true, false])), plain(native.getViewLinesData.call(unsupported.lines, 1, 2, [true, false])));
    const values = Array(9000).fill(1); values[100] = 0;
    const large = fixture(values);
    let calls = 0;
    const needed = [];
    large.lines.getViewLinesData = function (...args) { calls++; assert.deepEqual(args, [1, 8999, needed]); return 'native'; };
    api.optimizeLargeEditorVisibleRendering(large.lines);
    assert.equal(large.lines.getViewLinesData(1, 8999, needed), 'native');
    assert.equal(calls, 1);
    const installed = large.lines.getViewLinesData;
    api.optimizeLargeEditorVisibleRendering(large.lines);
    assert.equal(large.lines.getViewLinesData, installed, 'adapting the same lines object twice is harmless');
    assert.doesNotThrow(() => api.optimizeLargeEditorVisibleRendering({}));
});
