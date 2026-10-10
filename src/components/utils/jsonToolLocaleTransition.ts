import type { editor } from 'monaco-editor/esm/vs/editor/editor.api';

export type JsonToolOutputType = 'json' | 'yaml' | 'toml' | 'xml' | 'go' | 'typescript' | 'text';
export interface EditorLocaleState {
    text: string;
    viewState: editor.ICodeEditorViewState | null;
}
export interface DiffLocaleState {
    left: EditorLocaleState;
    right: EditorLocaleState;
    activeDiffIndex: number;
    wasFullscreenBeforeDiff: boolean;
}
