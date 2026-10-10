import { ChunkedLineSums } from './chunkedLineSums';
import { Range } from 'monaco-editor/esm/vs/editor/common/core/range.js';

const MAX_VIEW_ROWS = 8192;
const adapted = new WeakSet<object>();

interface VisibleRun {
    viewStart: number;
    viewEnd: number;
    modelStart: number;
    modelEnd: number;
}

/** Split a viewport at hidden model ranges, visiting only its visible view rows. */
const getRuns = (lines: any, start: number, end: number): VisibleRun[] | null => {
    const counts = lines.projectedModelLineLineCounts;
    if (!(counts instanceof ChunkedLineSums) || !Array.isArray(lines.modelLineProjections) || typeof lines._toValidViewLineNumber !== 'function') return null;
    start = lines._toValidViewLineNumber(start);
    end = lines._toValidViewLineNumber(end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || end - start >= MAX_VIEW_ROWS) return null;
    const runs: VisibleRun[] = [];
    for (let viewLine = start; viewLine <= end; viewLine++) {
        const index = counts.getIndexOf(viewLine - 1).index;
        if (!Number.isInteger(index) || index < 0 || index >= lines.modelLineProjections.length) return null;
        const modelLine = index + 1;
        const previous = runs[runs.length - 1];
        if (previous && modelLine <= previous.modelEnd + 1) {
            previous.viewEnd = viewLine;
            previous.modelEnd = modelLine;
        } else {
            runs.push({ viewStart: viewLine, viewEnd: viewLine, modelStart: modelLine, modelEnd: modelLine });
        }
    }
    return runs.length > 1 ? runs : null;
};

/** Keep Monaco's projection and indentation rules, but skip large folded gaps when rendering.
 * Decoration queries follow Microsoft Monaco 0.52's MIT-licensed viewModelLines implementation.
 * Unrecognized internals or large non-viewport requests retain Monaco's original methods.
 */
export const optimizeLargeEditorVisibleRendering = (lines: any) => {
    if (!lines || adapted.has(lines) || !Array.isArray(lines.modelLineProjections) || typeof lines._toValidViewLineNumber !== 'function') return;
    adapted.add(lines);

    const data = lines.getViewLinesData;
    if (typeof data === 'function') {
        lines.getViewLinesData = function (start: number, end: number, needed: boolean[]) {
            const runs = Array.isArray(needed) ? getRuns(this, start, end) : null;
            if (!runs) return data.call(this, start, end, needed);
            const requestStart = runs[0].viewStart;
            let result: unknown[] = [];
            for (const run of runs) {
                const offset = run.viewStart - requestStart;
                result = result.concat(data.call(this, run.viewStart, run.viewEnd, needed.slice(offset, offset + run.viewEnd - run.viewStart + 1)));
            }
            return result;
        };
    }

    const indent = lines.getViewLinesIndentGuides;
    if (typeof indent === 'function') {
        lines.getViewLinesIndentGuides = function (start: number, end: number) {
            const runs = getRuns(this, start, end);
            if (!runs) return indent.call(this, start, end);
            let result: number[] = [];
            for (const run of runs) result = result.concat(indent.call(this, run.viewStart, run.viewEnd));
            return result;
        };
    }

    const decorations = lines.getDecorationsInRange;
    const compareRanges = (Range as any).compareRangesUsingStarts;
    if (typeof decorations !== 'function' || typeof compareRanges !== 'function'
        || typeof lines.convertViewPositionToModelPosition !== 'function' || typeof lines.model?.getDecorationsInRange !== 'function'
        || typeof lines.model?.getLineMaxColumn !== 'function') return;
    lines.getDecorationsInRange = function (range: any, ownerId: number, filterOutValidation: boolean, onlyMinimapDecorations: boolean, onlyMarginDecorations: boolean) {
        const runs = getRuns(this, range.startLineNumber, range.endLineNumber);
        if (!runs) return decorations.call(this, range, ownerId, filterOutValidation, onlyMinimapDecorations, onlyMarginDecorations);
        const start = this.convertViewPositionToModelPosition(range.startLineNumber, range.startColumn);
        const end = this.convertViewPositionToModelPosition(range.endLineNumber, range.endColumn);
        // Monaco's fast path includes column 1 and forwards the margin filter. Preserve it unchanged.
        if (end.lineNumber - start.lineNumber <= range.endLineNumber - range.startLineNumber) {
            return decorations.call(this, range, ownerId, filterOutValidation, onlyMinimapDecorations, onlyMarginDecorations);
        }
        let result: any[] = [];
        for (let i = 0; i < runs.length; i++) {
            const run = runs[i];
            const query = new Range(run.modelStart, i === 0 ? start.column : 1, run.modelEnd,
                i === runs.length - 1 ? end.column : this.model.getLineMaxColumn(run.modelEnd));
            // The native cross-fold path omits onlyMarginDecorations; retain its filtering semantics.
            result = result.concat(this.model.getDecorationsInRange(query, ownerId, filterOutValidation, onlyMinimapDecorations));
        }
        result.sort((a, b) => compareRanges(a.range, b.range) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        return result.filter((decoration, index) => index === 0 || decoration.id !== result[index - 1].id);
    };
};
