import { computeLineDiff, computeInlineDiff, refineRepairLineChanges, type DiffLineChange } from '../utils/diffEngine';
let left: string[] = [], right: string[] = [], changes: DiffLineChange[] = [];
let navigationIndexes: number[] = [];
self.onmessage = ({ data }) => {
    try {
        if (data.type === 'compare') {
            left = data.left; right = data.right;
            const navigationChanges = computeLineDiff(left, right, { exact: true });
            changes = refineRepairLineChanges(left, right, navigationChanges);
            let index = 0;
            navigationIndexes = changes.map(change => {
                while (index + 1 < navigationChanges.length &&
                    change.originalStartLineNumber >= navigationChanges[index + 1].originalStartLineNumber &&
                    change.modifiedStartLineNumber >= navigationChanges[index + 1].modifiedStartLineNumber) index++;
                return index;
            });
            self.postMessage({ type: 'changes', changes, navigationChanges });
        } else if (data.type === 'inline') {
            const inline = [];
            // Character comparison is restricted to visible lines, not the entire large document.
            for (let changeIndex = 0; changeIndex < changes.length; changeIndex++) {
                const c = changes[changeIndex];
                if (c.originalEndLineNumber - c.originalStartLineNumber !== c.modifiedEndLineNumber - c.modifiedStartLineNumber) continue;
                const start = Math.max(c.modifiedStartLineNumber, data.start);
                const end = Math.min(c.modifiedEndLineNumber, data.end);
                for (let line = start; line <= end; line++) {
                    const leftLine = c.originalStartLineNumber + line - c.modifiedStartLineNumber;
                    const result = computeInlineDiff(left[leftLine - 1] || '', right[line - 1] || '');
                    if (result) inline.push({ changeIndex: navigationIndexes[changeIndex], leftLine, rightLine: line, ...result });
                }
            }
            self.postMessage({ type: 'inline', inline, requestId: data.requestId });
        }
    } catch (error) { self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) }); }
};
