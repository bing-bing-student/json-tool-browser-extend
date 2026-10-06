import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';

export const JSON_TOOL_LIGHT_THEME = 'json-tool-light-theme';
export const JSON_TOOL_DARK_THEME = 'json-tool-dark-theme';
export const JSON_TOOL_TOML_THEME = 'json-tool-toml-theme';
export const JSON_TOOL_TOML_DARK_THEME = 'json-tool-toml-dark-theme';

export type JsonToolThemeMode = 'light' | 'dark';

const currentLineHighlightColors = {
    'editor.lineHighlightBackground': '#EAF8EF',
    'editor.lineHighlightBorder': '#00000000',
};

const darkCurrentLineHighlightColors = {
    'editor.lineHighlightBackground': '#2A2D35',
    'editor.lineHighlightBorder': '#00000000',
    'editor.background': '#1E1E1E',
    'editor.foreground': '#CCCCCC',
    'editorGutter.background': '#181818',
    'editorLineNumber.foreground': '#858585',
    'editorLineNumber.activeForeground': '#C6C6C6',
    'editorCursor.foreground': '#AEAFAD',
    'editor.selectionBackground': '#264F78',
    'editor.inactiveSelectionBackground': '#3A3D41',
    'editorIndentGuide.background1': '#404040',
    'editorIndentGuide.activeBackground1': '#707070',
};

export const getJsonToolThemeForLanguage = (language: string, mode: JsonToolThemeMode = 'light') => {
    if (language === 'toml') {
        return mode === 'dark' ? JSON_TOOL_TOML_DARK_THEME : JSON_TOOL_TOML_THEME;
    }
    return mode === 'dark' ? JSON_TOOL_DARK_THEME : JSON_TOOL_LIGHT_THEME;
};

export const defineJsonToolMonacoThemes = (monacoApi: typeof Monaco) => {
    monacoApi.editor.defineTheme(JSON_TOOL_LIGHT_THEME, {
        base: 'vs',
        inherit: true,
        rules: [],
        colors: currentLineHighlightColors,
    });

    monacoApi.editor.defineTheme(JSON_TOOL_DARK_THEME, {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: darkCurrentLineHighlightColors,
    });

    monacoApi.editor.defineTheme(JSON_TOOL_TOML_THEME, {
        base: 'vs',
        inherit: true,
        rules: [
            { token: 'comment', foreground: '6A9955' },
            { token: 'variable', foreground: '0011FF' },
            { token: 'type.identifier', foreground: 'AF00DB' },
            { token: 'string', foreground: 'A31515' },
            { token: 'string.date', foreground: '098658' },
            { token: 'number', foreground: '098658' },
            { token: 'keyword', foreground: '0000FF' },
        ],
        colors: currentLineHighlightColors,
    });

    monacoApi.editor.defineTheme(JSON_TOOL_TOML_DARK_THEME, {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'comment', foreground: '6A9955' },
            { token: 'variable', foreground: '9CDCFE' },
            { token: 'type.identifier', foreground: '4EC9B0' },
            { token: 'string', foreground: 'CE9178' },
            { token: 'string.date', foreground: 'B5CEA8' },
            { token: 'number', foreground: 'B5CEA8' },
            { token: 'keyword', foreground: '569CD6' },
        ],
        colors: darkCurrentLineHighlightColors,
    });
};
