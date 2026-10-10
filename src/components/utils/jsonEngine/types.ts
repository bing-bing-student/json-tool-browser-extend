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

export class JsonInputParseError extends SyntaxError {
    constructor(message: string) { super(message); this.name = 'JsonInputParseError'; }
}
