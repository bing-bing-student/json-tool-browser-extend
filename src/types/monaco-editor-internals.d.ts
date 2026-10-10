// Narrow declarations for the guarded Monaco 0.52 large-editor adapter.
declare module 'monaco-editor/esm/vs/editor/common/viewModel/modelLineProjection.js' {
    export function createModelLineProjection(data: unknown, visible: boolean): {
        isVisible(): boolean;
        getViewLineCount(): number;
    };
}

declare module 'monaco-editor/esm/vs/editor/common/viewEvents.js' {
    export class ViewLinesInsertedEvent {
        constructor(fromLineNumber: number, toLineNumber: number);
        readonly type: number;
        readonly fromLineNumber: number;
        readonly toLineNumber: number;
    }
}

declare module 'monaco-editor/esm/vs/editor/common/core/range.js' {
    export class Range {
        constructor(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number);
        readonly startLineNumber: number;
        readonly startColumn: number;
        readonly endLineNumber: number;
        readonly endColumn: number;
        isEmpty(): boolean;
    }
}

declare module 'monaco-editor/esm/vs/editor/contrib/folding/browser/foldingRanges.js' {
    export class FoldingRegions {
        readonly length: number;
        static fromFoldRanges(ranges: ReadonlyArray<{
            startLineNumber: number;
            endLineNumber: number;
            isCollapsed: boolean;
            type?: string;
            source?: number;
        }>): FoldingRegions;
    }
}


declare module 'monaco-editor/esm/vs/editor/browser/controller/textAreaState.js' {
    export class TextAreaState {
        constructor(value: string, selectionStart: number, selectionEnd: number, selection: any, newlineCountBeforeSelection: number | undefined);
        value: string;
        selectionStart: number;
        selectionEnd: number;
        selection: any;
        newlineCountBeforeSelection: number | undefined;
    }
    export class PagedScreenReaderStrategy {
        static fromEditorSelection(model: any, selection: any, linesPerPage: number, trimLongText: boolean): TextAreaState;
    }
}
