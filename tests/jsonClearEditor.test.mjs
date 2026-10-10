import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';

// Use Monaco's real tracked decorations, text buffer, folding/hidden-range
// models and undo stack. Only the host editor and unrelated language services
// are supplied by this fixture; no hand-written decoration relocation is used.
const bundled = await build({
    stdin: { contents: `
        export { clearEditorContent } from './src/components/utils/clearEditorContent';
        export { TextModel } from 'monaco-editor/esm/vs/editor/common/model/textModel.js';
        export { FoldingModel } from 'monaco-editor/esm/vs/editor/contrib/folding/browser/foldingModel.js';
        export { FoldingRegions } from 'monaco-editor/esm/vs/editor/contrib/folding/browser/foldingRanges.js';
        export { HiddenRangeModel } from 'monaco-editor/esm/vs/editor/contrib/folding/browser/hiddenRangeModel.js';
        export { UndoRedoService } from 'monaco-editor/esm/vs/platform/undoRedo/common/undoRedoService.js';`,
        resolveDir: process.cwd() },
    bundle: true, platform: 'node', format: 'cjs', write: false,
});
const module = { exports: {} };
let scheduled = 0;
runInNewContext(bundled.outputFiles[0].text, {
    module, exports: module.exports, process, console, URL, performance, TextEncoder, TextDecoder,
    setTimeout(callback, delay, ...args) { scheduled++; return setTimeout(callback, delay, ...args); },
    clearTimeout, queueMicrotask,
    requestAnimationFrame() { assert.fail('clearing stale folds must finish before an animation frame'); },
});
const api = module.exports;
const subscribe = () => ({ dispose() {} });
const moderateText = [
    '{', '  "meta": {', '    "source": "test",', '    "version": 1,', '    "ok": true', '  },',
    '  "orders": [', '    {', '      "id": 1,', '      "items": ["a", "b"]', '    }', '  ],',
    '  "stats": {', '    "count": 1,', '    "ok": true,', '    "failed": 0', '  }', '}',
].join('\n');
const moderateFolds = [
    { startLineNumber: 2, endLineNumber: 6, isCollapsed: true },
    { startLineNumber: 7, endLineNumber: 12, isCollapsed: true },
    { startLineNumber: 13, endLineNumber: 17, isCollapsed: true },
];
const getFoldDecorations = (model) => model.getAllDecorations().filter(d => d.options.description === 'test-fold');
const makeNativeEditor = (text = moderateText, foldRanges = moderateFolds) => {
    const undoRedo = new api.UndoRedoService({}, {});
    const model = new api.TextModel(text, 'json', {
        ...api.TextModel.DEFAULT_CREATION_OPTIONS,
        bracketPairColorizationOptions: { enabled: false, independentColorPoolPerBracketType: false },
    }, null, undoRedo, { requestRichLanguageFeatures() {} }, { onDidChange: subscribe }, {
        createInstance: () => ({
            onDidChangeLanguage: subscribe, onDidChangeLanguageConfiguration: subscribe, onDidChangeTokens: subscribe,
            getLanguageId: () => 'json', handleDidChangeContent() {}, dispose() {},
        }),
    });
    const provider = {
        getDecorationOption(isCollapsed) { return { description: 'test-fold',
            after: isCollapsed ? { content: '…', inlineClassName: 'test-folded' } : undefined }; },
        changeDecorations: (callback) => model.changeDecorations(callback),
        removeDecorations: (ids) => model.deltaDecorations(ids, []),
    };
    const folding = new api.FoldingModel(model, provider);
    const hidden = new api.HiddenRangeModel(folding);
    let hiddenChanged = 0;
    const hiddenSubscription = hidden.onDidChange(() => { hiddenChanged++; });
    const modelSubscription = model.onDidChangeContent(e => hidden.notifyChangeModelContent(e));
    folding.updatePost(api.FoldingRegions.fromFoldRanges(foldRanges));
    const edits = [], contributions = [];
    const editor = {
        getModel: () => model,
        executeEdits(source, changes) {
            edits.push({ source, changes });
            model.pushEditOperations(null, changes, null);
            return true;
        },
        getContribution(id) { contributions.push(id); return id === 'editor.contrib.folding' ? { foldingModel: folding } : null; },
        setValue() { assert.fail('clear must preserve the existing model undo stack'); },
        setModel() { assert.fail('clear must preserve the existing model'); },
        getAction() { assert.fail('clear must not expand the entire large document first'); },
    };
    return { editor, model, folding, hidden, edits, contributions, hiddenChanged: () => hiddenChanged,
        cleanup() { modelSubscription.dispose(); hiddenSubscription.dispose(); hidden.dispose(); folding.dispose(); model.dispose(); } };
};

const verifyNativeClear = async (text, foldRanges) => {
    const f = makeNativeEditor(text, foldRanges);
    try {
        const [markerId] = f.model.deltaDecorations([], [{ range: { startLineNumber: 1, startColumn: 1,
            endLineNumber: 1, endColumn: 2 }, options: { description: 'unrelated-marker', inlineClassName: 'marker' } }]);
        const originalFoldIds = getFoldDecorations(f.model).map(d => d.id);
        assert.equal(originalFoldIds.length, 3);
        assert.equal(f.hidden.hiddenRanges.length, 3);
        let residualAfterDeletion = 0;
        const nativeEdit = f.editor.executeEdits;
        f.editor.executeEdits = (...args) => {
            const result = nativeEdit(...args);
            const folds = getFoldDecorations(f.model);
            residualAfterDeletion = folds.length;
            for (const fold of folds) {
                assert.equal(fold.range.startLineNumber, 1);
                assert.equal(fold.range.endLineNumber, 1);
                assert.equal(fold.range.startColumn, 1);
                assert.equal(fold.range.endColumn, 1);
                assert.equal(fold.options.after.content, '…');
            }
            return result;
        };
        const hiddenBefore = f.hiddenChanged(), scheduledBefore = scheduled;
        api.clearEditorContent(f.editor, 'clear-input');
        assert.equal(residualAfterDeletion, 3, 'native full-range deletion itself leaves three ellipses at 1:1');
        assert.equal(f.model.getValueLength(), 0);
        assert.equal(f.model.getLineCount(), 1);
        assert.equal(getFoldDecorations(f.model).length, 0, 'no collapsed injected text remains when clear returns');
        assert.equal(f.folding.regions.length, 0);
        assert.equal(f.hidden.hiddenRanges.length, 0, 'the native hidden-range event clears the view synchronously');
        assert.equal(f.hiddenChanged(), hiddenBefore + 1);
        assert.equal(scheduled, scheduledBefore, 'no delayed folding recalculation is required');
        assert.ok(f.model.getDecorationRange(markerId), 'non-fold decorations remain owned by their original feature');
        for (const id of originalFoldIds) assert.equal(f.model.getDecorationRange(id), null);
        assert.equal(f.edits.length, 1);
        assert.equal(f.edits[0].source, 'clear-input');
        assert.equal(f.edits[0].changes[0].text, '');
        assert.equal(f.edits[0].changes[0].range.startLineNumber, 1);
        assert.equal(f.edits[0].changes[0].range.endLineNumber, text.split('\n').length);
        assert.equal(f.editor.getModel(), f.model);
        assert.ok(f.model.canUndo());
        await f.model.undo();
        assert.equal(f.model.getValue(), text, 'native undo restores every original byte');
        assert.ok(f.model.canRedo());
        await f.model.redo();
        assert.equal(f.model.getValue(), '', 'native redo remains a normal clear operation');
    } finally { f.cleanup(); }
};

test('clearing nested collapsed JSON removes transient first-line ellipses synchronously and preserves native undo', async () => {
    await verifyNativeClear(moderateText, moderateFolds);
});

test('an already empty model clears stale folding decorations without creating a no-op undo edit', () => {
    const f = makeNativeEditor();
    try {
        f.editor.executeEdits('prior-clear', [{ range: f.model.getFullModelRange(), text: '' }]);
        assert.equal(getFoldDecorations(f.model).length, 3);
        api.clearEditorContent(f.editor, 'clear-empty');
        assert.equal(f.edits.length, 1, 'the empty range does not create another edit');
        assert.equal(getFoldDecorations(f.model).length, 0);
        assert.equal(f.hidden.hiddenRanges.length, 0);
    } finally { f.cleanup(); }
});

test('the same cleanup works when three collapsed regions span a million-line model', async () => {
    const lines = 1025568, values = lines - 14;
    const text = [
        '{', '  "meta": {', '    "source": "test",', '    "version": 1,', '    "ok": true', '  },', '  "orders": [',
    ].join('\n') + '\n' + '    0,\n'.repeat(values - 1) + '    0\n' + [
        '  ],', '  "stats": {', `    "count": ${values},`, '    "ok": true,', '    "failed": 0', '  }', '}',
    ].join('\n');
    await verifyNativeClear(text, [
        { startLineNumber: 2, endLineNumber: 6, isCollapsed: true },
        { startLineNumber: 7, endLineNumber: lines - 6, isCollapsed: true },
        { startLineNumber: lines - 5, endLineNumber: lines - 1, isCollapsed: true },
    ]);
});

const makeGuardEditor = () => {
    let length = 20, disposed = false, executed = 0, updates = 0;
    const model = { isDisposed: () => disposed, getValueLength: () => length,
        getFullModelRange: () => ({ startLineNumber: 1, startColumn: 1, endLineNumber: length === 0 ? 1 : 5, endColumn: length === 0 ? 1 : 2, isEmpty: () => length === 0 }) };
    const folding = { textModel: model, updatePost(regions) { assert.equal(regions.length, 0); updates++; } };
    const editor = { getModel: () => model, executeEdits() { executed++; length = 0; return true; },
        getContribution: () => ({ foldingModel: folding }) };
    return { editor, model, folding, executed: () => executed, updates: () => updates,
        setLength: (value) => { length = value; }, setDisposed: () => { disposed = true; } };
};

test('empty editors and absent or already disposed models remain safe', () => {
    for (const mutation of [f => f.setLength(0), f => { f.editor.getModel = () => null; }, f => f.setDisposed()]) {
        const f = makeGuardEditor(); mutation(f);
        assert.doesNotThrow(() => api.clearEditorContent(f.editor, 'clear-empty'));
    }
});

test('a rejected or incomplete edit never removes folding state from nonempty content', () => {
    for (const execute of [() => false, () => true]) {
        const f = makeGuardEditor(); f.editor.executeEdits = execute;
        api.clearEditorContent(f.editor, 'clear-input');
        assert.equal(f.updates(), 0);
    }
});

test('content listeners that replace or dispose the model do not clear another model folding state', () => {
    for (const mutate of [
        f => { f.editor.getModel = () => ({ ...f.model }); },
        f => { f.editor.getModel = () => null; },
        f => f.setDisposed(),
    ]) {
        const f = makeGuardEditor(), nativeEdit = f.editor.executeEdits;
        f.editor.executeEdits = (...args) => { const result = nativeEdit(...args); mutate(f); return result; };
        assert.doesNotThrow(() => api.clearEditorContent(f.editor, 'clear-input'));
        assert.equal(f.updates(), 0);
    }
});

test('unknown folding contributions and wrong model ownership retain native clear behavior', () => {
    for (const mutate of [
        f => { f.editor.getContribution = () => null; },
        f => { f.editor.getContribution = () => ({}); },
        f => { f.folding.textModel = {}; },
        f => { f.folding.updatePost = undefined; },
    ]) {
        const f = makeGuardEditor(); mutate(f);
        assert.doesNotThrow(() => api.clearEditorContent(f.editor, 'clear-input'));
        assert.equal(f.model.getValueLength(), 0);
        assert.equal(f.updates(), 0);
    }
});
