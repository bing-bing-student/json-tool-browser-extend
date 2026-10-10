import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { FoldingRegions } from 'monaco-editor/esm/vs/editor/contrib/folding/browser/foldingRanges.js';

/** Keep the model and undo history while clearing both text and its fold markers.
 * Monaco tracks folded decorations through edits, but recalculates folding later.
 * A full deletion moves those markers to line 1 until that delayed update runs.
 */
export const clearEditorContent = (editor: monaco.editor.IStandaloneCodeEditor, source: string) => {
    const model = editor.getModel();
    if (!model || model.isDisposed()) return;
    const range = model.getFullModelRange();
    if (!range.isEmpty() && !editor.executeEdits(source, [{ range, text: '' }])) return;

    if (editor.getModel() !== model || model.isDisposed() || model.getValueLength() !== 0) return;
    // Reset after deletion so clearing hidden areas never expands the old large document.
    const folding = (editor.getContribution('editor.contrib.folding') as any)?.foldingModel;
    if (folding?.textModel === model && typeof folding.updatePost === 'function') {
        folding.updatePost(FoldingRegions.fromFoldRanges([]));
    }
};
