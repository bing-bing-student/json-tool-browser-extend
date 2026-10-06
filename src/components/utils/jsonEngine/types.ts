export type JsonEngineMode = 'strict-json' | 'compatible';

export type SlashEscapeMode = 'normalize' | 'preserve' | 'html-safe';

export interface JsonEngineOptions {
    mode: JsonEngineMode;
    indentSize: number;
    arrayNewLine: boolean;
    preserveNumberLiterals: boolean;
    preserveUnicodeEscapes: boolean;
    decodeEncoding: boolean;
    slashEscapeMode: SlashEscapeMode;
}

export interface JsonParseOptions {
    preserveNumberLiterals?: boolean;
    encodingMode?: boolean;
}

export interface JsonParseResult {
    data: any;
    escapeMap: Map<string, string>;
    originalString?: string;
}

export interface JsonFormatterOptions {
    indentSize: number;
    arrayNewLine: boolean;
    preserveNumberLiterals: boolean;
    encodingMode?: boolean;
}

export interface JsonFormatResult extends JsonParseResult {
    formatted: string;
}
