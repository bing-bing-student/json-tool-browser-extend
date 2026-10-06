type JsonToolWordWrapMode = 'off' | 'on';

export interface JsonToolWordWrapOptions {
    wordWrap: JsonToolWordWrapMode;
    wordWrapOverride1: JsonToolWordWrapMode;
    wordWrapOverride2: JsonToolWordWrapMode;
}

export const JSON_TOOL_LONG_LINE_RENDER_PREVIEW_CHARS = 10000;
export const JSON_TOOL_UNSAFE_LONG_LINE_THRESHOLD = 200000;

export const getJsonToolWordWrapOptions = (singleLineDisplay: boolean): JsonToolWordWrapOptions => {
    const mode: JsonToolWordWrapMode = singleLineDisplay ? 'off' : 'on';

    // Monaco forces viewport wrapping for models dominated by long lines when
    // wordWrapOverride1/2 stay as "inherit". Keep all three values aligned.
    return {
        wordWrap: mode,
        wordWrapOverride1: mode,
        wordWrapOverride2: mode,
    };
};

/**
 * The workbench supplies the effective setting: when an unsafe long line is
 * present it forces singleLineDisplay=false until both editor models are safe.
 */
export const getJsonToolLongLineViewOptions = (singleLineDisplay: boolean) => ({
    ...getJsonToolWordWrapOptions(singleLineDisplay),
    stopRenderingLineAfter: singleLineDisplay ? JSON_TOOL_LONG_LINE_RENDER_PREVIEW_CHARS : -1,
    wrappingStrategy: 'simple' as const,
});
