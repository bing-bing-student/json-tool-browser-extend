import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { PagedScreenReaderStrategy } from 'monaco-editor/esm/vs/editor/browser/controller/textAreaState.js';

const MIN_LARGE_MODEL_LINES = 300000;
const adapted = new WeakSet<object>();

const isSelection = (selection: any) => selection && typeof selection.getStartPosition === 'function'
    && typeof selection.getEndPosition === 'function' && Number.isInteger(selection.startLineNumber)
    && Number.isInteger(selection.endLineNumber) && Number.isInteger(selection.startColumn) && Number.isInteger(selection.endColumn);

/** Keep the native input context bounded when a view page spans a large collapsed range.
 * Unknown accessibility still uses Monaco's screen-reader strategy, with real model offsets.
 * The resulting selection is restored to view coordinates for Monaco's native input host.
 */
export const optimizeLargeEditorInputContext = (editor: monaco.editor.IStandaloneCodeEditor) => {
    const handler = (editor as any)._modelData?.view?._textAreaHandler;
    const input = handler?._textAreaInput;
    const host = input?._host;
    const original = host?.getScreenReaderContent;
    if (!handler || adapted.has(handler) || typeof original !== 'function' || typeof input?._browser?.isAndroid !== 'boolean') return;
    adapted.add(handler);
    host.getScreenReaderContent = function () {
        const model = editor.getModel();
        const viewModel = (editor as any)._modelData?.viewModel;
        const hidden = viewModel?._lines?.hiddenAreasDecorationIds;
        const modelSelection = handler._modelSelections?.[0];
        const viewSelection = handler._selections?.[0];
        const pageSize = handler._accessibilityPageSize;
        if (handler._accessibilitySupport !== 0 || input._browser.isAndroid || !model || model.isDisposed()
            || model.getLineCount() < MIN_LARGE_MODEL_LINES || !Array.isArray(hidden) || hidden.length === 0
            || handler._context?.viewModel !== viewModel || viewModel.model !== model
            || !isSelection(modelSelection) || !isSelection(viewSelection) || !Number.isInteger(pageSize) || pageSize < 1
            || typeof model.getLineMaxColumn !== 'function' || typeof model.getValueInRange !== 'function'
            || typeof model.getValueLengthInRange !== 'function' || typeof model.modifyPosition !== 'function') {
            return original.call(this);
        }
        // This strategy returns a fresh state. Preserve its text, offsets and local newline count.
        // Only the anchor must use view coordinates: native deduceModelPosition converts it back.
        const state = PagedScreenReaderStrategy.fromEditorSelection(model, modelSelection, pageSize, true);
        state.selection = viewSelection;
        return state;
    };
};
