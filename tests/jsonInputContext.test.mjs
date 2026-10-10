import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';

const bundled = await build({
    stdin: { contents: `
        export { optimizeLargeEditorInputContext } from './src/components/utils/largeEditorInputContext';
        export { PagedScreenReaderStrategy, TextAreaState } from 'monaco-editor/esm/vs/editor/browser/controller/textAreaState.js';
        export { Range } from 'monaco-editor/esm/vs/editor/common/core/range.js';
        export { Selection } from 'monaco-editor/esm/vs/editor/common/core/selection.js';
        export { Position } from 'monaco-editor/esm/vs/editor/common/core/position.js';`, resolveDir: process.cwd() },
    bundle: true, platform: 'node', format: 'cjs', write: false,
});
const module = { exports: {} };
runInNewContext(bundled.outputFiles[0].text, { module, exports: module.exports });
const api = module.exports;
const plain = (value) => JSON.parse(JSON.stringify(value));

// A million-line virtual text model avoids allocating the entire document in this test.
// It supports the same UTF-16 offsets, newline normalization and range operations used by Monaco's strategy.
const fixture = ({ count = 1000012, eol = '\n', payload = '    {"id":123456,"name":"😀 中文"},' } = {}) => {
    const statsLine = count - 5;
    const overrides = new Map([[1, '{'], [2, '  "orders": ['], [statsLine - 1, '  ],'], [statsLine, '  "stats": {'],
        [statsLine + 1, '    "count": 1000000,'], [statsLine + 2, '    "label": "中文😀统计",'], [statsLine + 3, '    "ok": true'], [statsLine + 4, '  }'], [statsLine + 5, '}']]);
    const content = (line) => overrides.get(line) ?? payload;
    const offsets = new Float64Array(count);
    let length = 0, materializedLines = 0, largestQuery = 0, nativeCalls = 0;
    for (let i = 0; i < count; i++) { offsets[i] = length; length += content(i + 1).length + (i + 1 < count ? eol.length : 0); }
    const validatePosition = (position) => {
        const line = Math.max(1, Math.min(count, position.lineNumber));
        return new api.Position(line, Math.max(1, Math.min(content(line).length + 1, position.column)));
    };
    const getOffsetAt = (position) => { const valid = validatePosition(position); return offsets[valid.lineNumber - 1] + valid.column - 1; };
    const getPositionAt = (offset) => {
        offset = Math.max(0, Math.min(length, offset));
        let low = 0, high = offsets.length;
        while (low < high) { const middle = (low + high) >>> 1; if (offsets[middle] <= offset) low = middle + 1; else high = middle; }
        const line = Math.max(1, low);
        return validatePosition(new api.Position(line, offset - offsets[line - 1] + 1));
    };
    const endpoints = (range) => [validatePosition(range.getStartPosition()), validatePosition(range.getEndPosition())];
    const model = {
        isDisposed: () => false,
        getLineCount: () => count,
        getLineContent: content,
        getLineMaxColumn: (line) => content(Math.max(1, Math.min(count, line))).length + 1,
        getEOL: () => eol,
        getOffsetAt,
        getPositionAt,
        modifyPosition: (position, delta) => getPositionAt(getOffsetAt(position) + delta),
        getValueLengthInRange(range, preference) {
            const [start, end] = endpoints(range);
            return getOffsetAt(end) - getOffsetAt(start) - (preference === 1 ? (end.lineNumber - start.lineNumber) * (eol.length - 1) : 0);
        },
        getValueInRange(range, preference) {
            const [start, end] = endpoints(range);
            assert.ok(end.lineNumber - start.lineNumber < 1000, 'input context must not materialize the large collapsed document');
            const parts = [];
            for (let line = start.lineNumber; line <= end.lineNumber; line++) {
                materializedLines++;
                parts.push(content(line).slice(line === start.lineNumber ? start.column - 1 : 0, line === end.lineNumber ? end.column - 1 : undefined));
            }
            const value = parts.join(preference === 1 ? '\n' : eol);
            largestQuery = Math.max(largestQuery, value.length);
            return value;
        },
    };
    const viewModel = { model, _lines: { hiddenAreasDecorationIds: ['orders-fold'] } };
    const viewPosition = (position) => new api.Position(position.lineNumber >= statsLine ? position.lineNumber - statsLine + 3 : position.lineNumber, position.column);
    const modelPosition = (position) => new api.Position(position.lineNumber >= 3 ? position.lineNumber + statsLine - 3 : position.lineNumber, position.column);
    const host = { getScreenReaderContent() { nativeCalls++; return 'native'; } };
    const input = { _host: host, _browser: { isAndroid: false } };
    const handler = { _textAreaInput: input, _context: { viewModel }, _accessibilitySupport: 0, _accessibilityPageSize: 10 };
    const editor = { getModel: () => model, _modelData: { viewModel, view: { _textAreaHandler: handler } } };
    const select = (startLine = statsLine + 2, startColumn = 15, endLine = startLine, endColumn = startColumn) => {
        const modelSelection = new api.Selection(startLine, startColumn, endLine, endColumn);
        const start = viewPosition(modelSelection.getSelectionStart()), end = viewPosition(modelSelection.getPosition());
        handler._modelSelections = [modelSelection];
        handler._selections = [new api.Selection(start.lineNumber, start.column, end.lineNumber, end.column)];
    };
    select();
    return { editor, model, viewModel, handler, input, host, statsLine, select, modelPosition,
        nativeCalls: () => nativeCalls, materializedLines: () => materializedLines, largestQuery: () => largestQuery };
};

const expectedState = (sample) => api.PagedScreenReaderStrategy.fromEditorSelection(sample.model,
    sample.handler._modelSelections[0], sample.handler._accessibilityPageSize, true);
const compareState = (actual, expected, sample) => {
    assert.equal(actual.value, expected.value);
    assert.equal(actual.selectionStart, expected.selectionStart);
    assert.equal(actual.selectionEnd, expected.selectionEnd);
    assert.equal(actual.newlineCountBeforeSelection, expected.newlineCountBeforeSelection);
    assert.equal(actual.selection, sample.handler._selections[0], 'only the anchor changes to view coordinates');
    assert.ok(actual.value.length <= 2001, 'native trimmed input context has at most 500 + 1001 + 500 characters');
};

const deduceModelPosition = (sample, state, offset) => {
    const [anchor, delta, newlineCount] = state.deduceEditorPosition(offset);
    const modelAnchor = sample.modelPosition(anchor);
    const crlfAdjustment = sample.model.getEOL().length === 2 ? (delta < 0 ? -newlineCount : newlineCount) : 0;
    return sample.model.getPositionAt(sample.model.getOffsetAt(modelAnchor) + delta + crlfAdjustment);
};

test('a cursor after a million-line fold retains bounded native context and a view selection anchor', () => {
    const sample = fixture();
    api.optimizeLargeEditorInputContext(sample.editor);
    const actual = sample.host.getScreenReaderContent();
    compareState(actual, expectedState(sample), sample);
    assert.equal(sample.nativeCalls(), 0);
    assert.ok(sample.materializedLines() < 80);
    assert.ok(sample.largestQuery() <= 1001);
    const installed = sample.host.getScreenReaderContent;
    api.optimizeLargeEditorInputContext(sample.editor);
    assert.equal(sample.host.getScreenReaderContent, installed);
});

test('normal, explicit accessibility, Android and unsupported layouts keep the original host', () => {
    const sample = fixture();
    api.optimizeLargeEditorInputContext(sample.editor);
    for (const support of [1, 2]) { sample.handler._accessibilitySupport = support; assert.equal(sample.host.getScreenReaderContent(), 'native'); }
    sample.handler._accessibilitySupport = 0;
    sample.input._browser.isAndroid = true; assert.equal(sample.host.getScreenReaderContent(), 'native'); sample.input._browser.isAndroid = false;
    sample.viewModel._lines.hiddenAreasDecorationIds = []; assert.equal(sample.host.getScreenReaderContent(), 'native');
    sample.viewModel._lines.hiddenAreasDecorationIds = ['fold'];
    const selections = sample.handler._modelSelections; sample.handler._modelSelections = []; assert.equal(sample.host.getScreenReaderContent(), 'native'); sample.handler._modelSelections = selections;
    sample.handler._accessibilityPageSize = undefined; assert.equal(sample.host.getScreenReaderContent(), 'native');
    const small = fixture({ count: 1000 }); api.optimizeLargeEditorInputContext(small.editor); assert.equal(small.host.getScreenReaderContent(), 'native');
    const unsupported = fixture({ count: 1000 }); delete unsupported.input._browser; const original = unsupported.host.getScreenReaderContent;
    api.optimizeLargeEditorInputContext(unsupported.editor); assert.equal(unsupported.host.getScreenReaderContent, original);
    assert.doesNotThrow(() => api.optimizeLargeEditorInputContext({}));
});

test('LF and CRLF context offsets map through native view anchors to the same real model positions', () => {
    for (const eol of ['\n', '\r\n']) {
        const sample = fixture({ eol, payload: `  {"message":"${'中文😀'.repeat(30)}"},` });
        api.optimizeLargeEditorInputContext(sample.editor);
        sample.select(sample.statsLine + 2, 13, sample.statsLine + 3, 8);
        const actual = sample.host.getScreenReaderContent(), expected = expectedState(sample);
        compareState(actual, expected, sample);
        for (const offset of [0, actual.selectionStart - 3, actual.selectionStart, actual.selectionStart + 2, actual.selectionEnd, actual.value.length]) {
            const [anchor, delta, newlineCount] = expected.deduceEditorPosition(offset);
            const adjustment = eol.length === 2 ? delta < 0 ? -newlineCount : newlineCount : 0;
            const position = sample.model.getPositionAt(sample.model.getOffsetAt(anchor) + delta + adjustment);
            assert.deepEqual(plain(deduceModelPosition(sample, actual, offset)), plain(position));
        }
        assert.ok(actual.value.includes('中文😀'));
        assert.ok(actual.selectionStart <= 500);
    }
});

test('large selections preserve native truncation, direction and endpoint offset deduction', () => {
    const sample = fixture({ eol: '\r\n', payload: `  {"message":"${'中文😀'.repeat(40)}"},` });
    api.optimizeLargeEditorInputContext(sample.editor);
    for (const backward of [false, true]) {
        sample.select(...(backward ? [sample.statsLine + 2, 15, 2, 3] : [2, 3, sample.statsLine + 2, 15]));
        const actual = sample.host.getScreenReaderContent(), expected = expectedState(sample);
        compareState(actual, expected, sample);
        assert.ok(actual.value.includes('…'));
        assert.ok(actual.selectionEnd - actual.selectionStart <= 1001);
        for (const offset of [actual.selectionStart, actual.selectionStart + 2, actual.selectionEnd - 2, actual.selectionEnd]) {
            const [anchor, delta, newlineCount] = expected.deduceEditorPosition(offset);
            const adjustment = delta < 0 ? -newlineCount : newlineCount;
            const position = sample.model.getPositionAt(sample.model.getOffsetAt(anchor) + delta + adjustment);
            assert.deepEqual(plain(deduceModelPosition(sample, actual, offset)), plain(position));
        }
    }
});

test('Chinese composition, replacement and emoji input retain native TextAreaState deduction', () => {
    const sample = fixture(); api.optimizeLargeEditorInputContext(sample.editor);
    const state = sample.host.getScreenReaderContent();
    for (const text of ['中', '中文', '😀', '中文😀']) {
        const value = state.value.slice(0, state.selectionStart) + text + state.value.slice(state.selectionEnd);
        const cursor = state.selectionStart + text.length;
        const current = new api.TextAreaState(value, cursor, cursor, null, undefined);
        assert.deepEqual(plain(api.TextAreaState.deduceInput(state, current, true)), { text, replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 });
        const composing = new api.TextAreaState(value, state.selectionStart, cursor, null, undefined);
        const withViewAnchor = api.TextAreaState.deduceInput(state, composing, false);
        const expected = api.TextAreaState.deduceInput(expectedState(sample), composing, false);
        assert.deepEqual(plain(withViewAnchor), plain(expected));
    }
    sample.select(sample.statsLine + 2, 14, sample.statsLine + 2, 18);
    const selected = sample.host.getScreenReaderContent();
    const nextValue = selected.value.slice(0, selected.selectionStart) + '更新' + selected.value.slice(selected.selectionEnd);
    const replacement = new api.TextAreaState(nextValue, selected.selectionStart + 2, selected.selectionStart + 2, null, undefined);
    assert.deepEqual(plain(api.TextAreaState.deduceInput(selected, replacement, false)),
        plain(api.TextAreaState.deduceInput(expectedState(sample), replacement, false)));
});
