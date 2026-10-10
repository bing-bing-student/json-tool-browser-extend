import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

/** Monaco 0.52 updates its tokenization viewport on scroll/content changes,
 * but a fold at the same scrollTop can expose distant rows without either event.
 * Notify its native viewport handler; never force tokenization up to a far row.
 */
export const setupLargeEditorFoldTokenRefresh = (editor: monaco.editor.IStandaloneCodeEditor) => {
    if (typeof editor.onDidChangeHiddenAreas !== 'function') return;
    let disposed = false;
    let frame: number | null = null;
    const listener = editor.onDidChangeHiddenAreas(() => {
        if (disposed || frame !== null) return;
        const model = editor.getModel();
        frame = requestAnimationFrame(() => {
            frame = null;
            if (disposed || !model || editor.getModel() !== model || model.isDisposed()
                || model.getLanguageId() !== 'json' || model.getLineCount() < 300000) return;
            // Keep access to Monaco internals guarded and scoped to this editor.
            const view = (editor as any)._modelData?.viewModel;
            if (view?.model === model && typeof view.visibleLinesStabilized === 'function') {
                view.visibleLinesStabilized();
            }
        });
    });
    editor.onDidDispose(() => {
        disposed = true;
        listener.dispose();
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
    });
};
