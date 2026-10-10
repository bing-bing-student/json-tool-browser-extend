import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { ChunkedLineSums } from './chunkedLineSums';
import { getVisibleLineRuns } from './visibleLineRuns';
import { optimizeLargeEditorFolding } from './largeEditorFolding';
import { optimizeLargeEditorTokenCaches } from './largeEditorTokenCaches';
import { optimizeLargeEditorVisibleRendering } from './largeEditorVisibleRendering';
import { optimizeLargeEditorInputContext } from './largeEditorInputContext';
import { setupLargeEditorFoldTokenRefresh } from './largeEditorFoldTokens';
import { createModelLineProjection } from 'monaco-editor/esm/vs/editor/common/viewModel/modelLineProjection.js';
import { ViewLinesInsertedEvent } from 'monaco-editor/esm/vs/editor/common/viewEvents.js';
import { Range } from 'monaco-editor/esm/vs/editor/common/core/range.js';

const MAX_LOCAL_INSERT = 8192;

// These adapters preserve Monaco 0.52's operations but avoid whole-array copies for small edits.
// The insertion algorithm follows Microsoft Monaco's MIT-licensed viewModelLines implementation.
const optimizeProjectedInsert = (lines: any) => {
    const original = lines.onModelLinesInserted;
    if (typeof original !== 'function' || !Array.isArray(lines.modelLineProjections) || typeof lines._validModelVersionId !== 'number') return;
    lines.onModelLinesInserted = function (versionId: number, from: number, to: number, breaks: any[]) {
        if (!(this.projectedModelLineLineCounts instanceof ChunkedLineSums) || breaks.length > MAX_LOCAL_INSERT) return original.call(this, versionId, from, to, breaks);
        if (!versionId || versionId <= this._validModelVersionId) return null;
        const hidden = from > 2 && !this.modelLineProjections[from - 2].isVisible();
        const outputFrom = from === 1 ? 1 : this.projectedModelLineLineCounts.getPrefixSum(from - 1) + 1;
        const inserted = breaks.map((data) => createModelLineProjection(data, !hidden));
        const counts = inserted.map((line) => line.getViewLineCount());
        this.modelLineProjections.splice(from - 1, 0, ...inserted);
        this.projectedModelLineLineCounts.insertValues(from - 1, counts);
        return new ViewLinesInsertedEvent(outputFrom, outputFrom + counts.reduce((sum, value) => sum + value, 0) - 1);
    };
};

const optimizeVisibleRanges = (view: any) => {
    const original = view._toModelVisibleRanges;
    if (typeof original !== 'function' || !view.coordinatesConverter?.convertViewRangeToModelRange) return;
    view._toModelVisibleRanges = function (range: any) {
        const counts = this._lines?.projectedModelLineLineCounts;
        const hidden = this._lines?.hiddenAreasDecorationIds;
        if (!(counts instanceof ChunkedLineSums) || !Array.isArray(hidden) || range.endLineNumber - range.startLineNumber > MAX_LOCAL_INSERT) return original.call(this, range);
        const converted = this.coordinatesConverter.convertViewRangeToModelRange(range);
        if (!hidden.length) return [converted];
        const runs = getVisibleLineRuns(range.startLineNumber, range.endLineNumber, (line) => counts.getIndexOf(line - 1).index + 1);
        return runs.map((run, i) => new Range(run.start, i === 0 ? converted.startColumn : 1, run.end,
            i === runs.length - 1 ? converted.endColumn : this.model.getLineMaxColumn(run.end))).filter((run, i) => i < runs.length - 1 || !run.isEmpty());
    };
};

/** Scoped adapters for Monaco 0.52's line mapping, token caches and fold markers.
 * Private API guards keep unsupported layouts on Monaco's default implementation.
 */
export const optimizeLargeEditorLineMapping = (editor: monaco.editor.IStandaloneCodeEditor) => {
    setupLargeEditorFoldTokenRefresh(editor);
    let disposed = false;
    let scheduled = false;
    const adapted = new WeakSet<object>();
    let pendingFolding: unknown;
    const install = () => {
        scheduled = false;
        if (disposed) return;
        const model = editor.getModel();
        if (!model || model.isDisposed() || model.getLineCount() < 300000) return;
        optimizeLargeEditorInputContext(editor);
        // Keep all access to Monaco internals in this guarded, editor-scoped adapter.
        const view = (editor as any)._modelData?.viewModel;
        const lines = view?._lines;
        const counts = lines?.projectedModelLineLineCounts;
        if (!lines || !counts) return;
        if (!(counts instanceof ChunkedLineSums)) {
            const native = counts as { _values?: unknown; getPrefixSum?: unknown; getIndexOf?: unknown; insertValues?: unknown };
            if (!Array.isArray(native._values) || typeof native.getPrefixSum !== 'function' || typeof native.getIndexOf !== 'function' || typeof native.insertValues !== 'function') return;
            lines.projectedModelLineLineCounts = new ChunkedLineSums(native._values);
        }
        if (!adapted.has(lines)) { adapted.add(lines); optimizeProjectedInsert(lines); optimizeLargeEditorVisibleRendering(lines); }
        if (!adapted.has(view)) { adapted.add(view); optimizeVisibleRanges(view); }
        optimizeLargeEditorTokenCaches((model as any).tokenization?._tokens, adapted);
        const foldingPromise = (editor.getContribution('editor.contrib.folding') as any)?.getFoldingModel?.();
        if (foldingPromise && foldingPromise !== pendingFolding) {
            pendingFolding = foldingPromise;
            void foldingPromise.then((folding: any) => {
                if (disposed || !folding || adapted.has(folding) || editor.getModel() !== model) return;
                adapted.add(folding);
                optimizeLargeEditorFolding(folding);
            });
        }
    };
    const schedule = () => {
        if (scheduled || disposed) return;
        scheduled = true;
        queueMicrotask(install);
    };
    const listeners = [editor.onDidChangeModel(schedule), editor.onDidChangeModelContent(schedule), editor.onDidChangeConfiguration(schedule), editor.onDidLayoutChange(schedule)];
    editor.onDidDispose(() => { disposed = true; listeners.forEach((listener) => listener.dispose()); });
    schedule();
};
