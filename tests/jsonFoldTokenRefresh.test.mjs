import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';

// Load the adapter and Monaco's real viewport and tokenization plumbing. The
// fixture supplies only editor events, layout geometry, and a tiny test grammar.
const bundled = await build({
    stdin: { contents: `
        export { setupLargeEditorFoldTokenRefresh } from './src/components/utils/largeEditorFoldTokens';
        export { AttachedViews, AttachedViewHandler } from 'monaco-editor/esm/vs/editor/common/model/tokens.js';
        export { TokenizerWithStateStoreAndTextModel } from 'monaco-editor/esm/vs/editor/common/model/textModelTokens.js';
        export { ContiguousMultilineTokensBuilder } from 'monaco-editor/esm/vs/editor/common/tokens/contiguousMultilineTokensBuilder.js';
        export { Range } from 'monaco-editor/esm/vs/editor/common/core/range.js';`, resolveDir: process.cwd() },
    bundle: true, platform: 'node', format: 'cjs', write: false,
});
let nextFrame = 0;
const frames = new Map(), cancelled = [];
const module = { exports: {} };
runInNewContext(bundled.outputFiles[0].text, {
    module, exports: module.exports, setTimeout, clearTimeout, queueMicrotask,
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { cancelled.push(id); frames.delete(id); },
});
const api = module.exports;
const viewSource = await readFile('node_modules/monaco-editor/esm/vs/editor/common/viewModel/viewModelImpl.js', 'utf8');
const tokensSource = await readFile('node_modules/monaco-editor/esm/vs/editor/common/model/tokenizationTextModelPart.js', 'utf8');
const method = (source, name, next) => {
    const start = source.indexOf(`    ${name}(`), end = source.indexOf(`    ${next}(`, start);
    assert.ok(start >= 0 && end > start, `installed Monaco still defines ${name}`);
    return runInNewContext(`({${source.slice(start, end)}}).${name}`, api);
};
const nativeView = {
    getModelVisibleRanges: method(viewSource, 'getModelVisibleRanges', 'visibleLinesStabilized'),
    visibleLinesStabilized: method(viewSource, 'visibleLinesStabilized', '_handleVisibleLinesChanged'),
    getVisibleRanges: method(viewSource, 'getVisibleRanges', 'getHiddenAreas'),
    _toModelVisibleRanges: method(viewSource, '_toModelVisibleRanges', 'getCompletelyVisibleViewRange'),
    getCompletelyVisibleViewRange: method(viewSource, 'getCompletelyVisibleViewRange', 'getCompletelyVisibleViewRangeAtScrollTop'),
};
const nativeTokens = {
    refreshRanges: method(tokensSource, 'refreshRanges', 'refreshRange'),
    refreshRange: method(tokensSource, 'refreshRange', 'forceTokenization'),
};
const ranges = (value) => Array.from(value, (r) => [r.startLineNumber, r.endLineNumber ?? r.endLineNumberExclusive - 1]);
const flushFrame = () => {
    const pending = [...frames.values()]; frames.clear();
    for (const callback of pending) callback(0);
};
const event = () => {
    const listeners = new Set();
    return {
        subscribe(callback) { listeners.add(callback); return { dispose: () => listeners.delete(callback) }; },
        fire() { for (const callback of [...listeners]) callback(); },
        get size() { return listeners.size; },
    };
};
const makeEditor = (options = {}) => {
    const hidden = event(), dispose = event();
    let language = options.language ?? 'json', lineCount = options.lineCount ?? 1025568, isDisposed = false;
    let calls = 0;
    const model = {
        getLanguageId: () => language, getLineCount: () => lineCount, isDisposed: () => isDisposed,
        getValue: () => assert.fail('fold refresh must never read the entire document'),
        tokenization: { forceTokenization: () => assert.fail('fold refresh must not tokenize through the hidden array') },
    };
    const editor = { getModel: () => model, onDidChangeHiddenAreas: hidden.subscribe,
        onDidDispose: dispose.subscribe, _modelData: { viewModel: { model, visibleLinesStabilized() { calls++; } } } };
    api.setupLargeEditorFoldTokenRefresh(editor);
    return { editor, model, hidden, dispose, calls: () => calls,
        setLanguage: (value) => { language = value; }, setLineCount: (value) => { lineCount = value; },
        setDisposed: () => { isDisposed = true; } };
};

const nativeFixture = () => {
    const fixture = makeEditor();
    const reads = [], tokenized = new Map(), requests = [];
    const model = fixture.model;
    model.getLineMaxColumn = () => 20;
    // This fixture uses unindented keys, so native guessStartState needs no
    // ancestor lookup. Real indented JSON may inspect earlier lines to infer
    // context; this test bounds the tokenized ranges, not those native lookups.
    model.getLineFirstNonWhitespaceColumn = () => 1;
    model.getLineContent = (line) => { reads.push(line); return line === 1025563 ? '"stats": {' : `"field${line}": 1`; };
    const state = { clone() { return this; }, equals(other) { return other === this; } };
    const grammar = { getInitialState: () => state,
        tokenizeEncoded(text) { return { tokens: new Uint32Array([0, text.startsWith('"') ? 0x01008001 : 1]), endState: state }; } };
    const tokenizer = new api.TokenizerWithStateStoreAndTextModel(model.getLineCount(), grammar, model, { encodeLanguageId: () => 1 });
    const tokenPart = { ...nativeTokens, _textModel: model, _tokenizer: tokenizer,
        _backgroundTokenizer: { value: { requestTokens(start, end) { requests.push([start, end]); } } },
        setTokens(blocks) {
            const changes = [];
            for (const block of blocks) {
                changes.push({ fromLineNumber: block.startLineNumber, toLineNumber: block.endLineNumber });
                for (let line = block.startLineNumber; line <= block.endLineNumber; line++) tokenized.set(line, block.getLineTokens(line));
            }
            return { changes };
        },
        forceTokenization: () => assert.fail('native viewport refresh must not call forceTokenization'),
    };
    const attached = new api.AttachedViews(), attachedView = attached.attachView();
    let refreshes = 0;
    const handler = new api.AttachedViewHandler(() => { refreshes++; tokenPart.refreshRanges(handler.lineRanges); });
    const subscription = attached.onDidChangeVisibleRanges(({ state }) => state && handler.handleStateChange(state));
    let visibleLines = Array.from({ length: 42 }, (_, i) => i + 1), hiddenAreas = [];
    const view = { ...nativeView, model, _attachedView: attachedView,
        getLineMinColumn: () => 1, getLineMaxColumn: () => 20,
        viewLayout: { getLinesViewportData: () => ({ startLineNumber: 1, endLineNumber: visibleLines.length,
            completelyVisibleStartLineNumber: 1, completelyVisibleEndLineNumber: visibleLines.length }) },
        _lines: { getHiddenAreas: () => hiddenAreas },
        coordinatesConverter: { convertViewRangeToModelRange: (range) => new api.Range(
            visibleLines[range.startLineNumber - 1], range.startColumn,
            visibleLines[range.endLineNumber - 1], range.endColumn) },
    };
    fixture.editor._modelData.viewModel = view;
    // Native tokenization initially covers only the top viewport.
    view.visibleLinesStabilized(); reads.length = 0;
    return { ...fixture, view, reads, tokenized, requests, handler, refreshes: () => refreshes,
        fold() {
            visibleLines = [1, 2, 6, 7, 1025562, 1025563, 1025567, 1025568];
            hiddenAreas = [new api.Range(3, 1, 5, 20), new api.Range(8, 1, 1025561, 20), new api.Range(1025564, 1, 1025566, 20)];
            fixture.hidden.fire();
        },
        cleanup() { fixture.dispose.fire(); subscription.dispose(); handler.dispose(); } };
};

test('fixed-scroll fold refreshes native attached viewport tokens for the far-away stats key', () => {
    const f = nativeFixture();
    try {
        assert.deepEqual(ranges(f.handler.lineRanges), [[1, 42]]);
        assert.equal(f.tokenized.has(1025563), false);
        f.fold();
        const expected = [[1, 2], [6, 7], [1025562, 1025563], [1025567, 1025568]];
        assert.deepEqual(ranges(f.view.getVisibleRanges()), expected, 'fold changes model rows without a scroll event');
        assert.deepEqual(ranges(f.handler.lineRanges), [[1, 42]], 'the native attached range remains stale until notified');
        flushFrame();
        assert.deepEqual(ranges(f.handler.lineRanges), expected);
        assert.equal(f.tokenized.get(1025563)[1], 0x01008001, 'native heuristic tokenization supplies the grammar token for stats');
        assert.deepEqual(f.reads, [1025562, 1025563, 1025567, 1025568], 'this unindented fixture tokenizes only the newly visible tail ranges');
        assert.deepEqual(f.requests, [[1025562, 1025564], [1025567, 1025569]], 'native background follow-up requests remain viewport-sized');
    } finally { f.cleanup(); }
});

test('multiple fold events merge into one frame and native unchanged ranges avoid duplicate tokenization', () => {
    const f = nativeFixture();
    try {
        f.fold(); f.hidden.fire(); f.hidden.fire();
        assert.equal(frames.size, 1);
        flushFrame();
        assert.equal(f.refreshes(), 2, 'one initial viewport plus one changed folded viewport');
        f.reads.length = 0;
        f.hidden.fire(); flushFrame();
        assert.equal(f.refreshes(), 2, 'Monaco AttachedViewHandler skips an unchanged range');
        assert.deepEqual(f.reads, []);
    } finally { f.cleanup(); }
});

test('queued refresh ignores a replaced model and a later fold refreshes the current model', () => {
    const f = makeEditor();
    f.hidden.fire();
    const replacement = { ...f.model };
    f.editor.getModel = () => replacement;
    f.editor._modelData.viewModel.model = replacement;
    flushFrame();
    assert.equal(f.calls(), 0);
    f.hidden.fire(); flushFrame();
    assert.equal(f.calls(), 1);
    f.dispose.fire();
});

test('language and size are checked after the fold frame, including the large-file boundary', () => {
    for (const [language, lineCount, expected] of [['json', 300000, 1], ['json', 299999, 0], ['jsonc', 1025568, 0], ['plaintext', 1025568, 0]]) {
        const f = makeEditor(); f.hidden.fire(); f.setLanguage(language); f.setLineCount(lineCount); flushFrame();
        assert.equal(f.calls(), expected, `${language}, ${lineCount}`); f.dispose.fire();
    }
});

test('disposed models, missing models, and unsupported view internals keep native behavior', () => {
    for (const change of [
        (f) => f.setDisposed(),
        (f) => { f.editor.getModel = () => null; },
        (f) => { f.editor._modelData = null; },
        (f) => { f.editor._modelData.viewModel = {}; },
        (f) => { f.editor._modelData.viewModel.model = {}; },
        (f) => { f.editor._modelData.viewModel.visibleLinesStabilized = null; },
    ]) {
        const f = makeEditor(); f.hidden.fire(); change(f); assert.doesNotThrow(flushFrame);
        assert.equal(f.calls(), 0); f.dispose.fire();
    }
});

test('refresh uses the current view belonging to the captured model', () => {
    const f = makeEditor(); let newViewCalls = 0;
    f.hidden.fire();
    f.editor._modelData.viewModel = { model: f.model, visibleLinesStabilized() { newViewCalls++; } };
    flushFrame();
    assert.equal(f.calls(), 0); assert.equal(newViewCalls, 1); f.dispose.fire();
});

test('editor disposal removes the listener and cancels its queued animation frame', () => {
    const f = makeEditor(); f.hidden.fire();
    const pending = [...frames.keys()], alreadyQueuedCallback = [...frames.values()][0];
    assert.equal(f.hidden.size, 1); f.dispose.fire();
    assert.equal(f.hidden.size, 0); assert.ok(cancelled.includes(pending[0])); assert.equal(frames.size, 0);
    alreadyQueuedCallback(0); f.hidden.fire();
    assert.equal(f.calls(), 0, 'a callback already selected by the browser remains harmless after disposal');
});

test('editors without hidden-area events do not install the adapter', () => {
    assert.doesNotThrow(() => api.setupLargeEditorFoldTokenRefresh({}));
    assert.equal(frames.size, 0);
});
