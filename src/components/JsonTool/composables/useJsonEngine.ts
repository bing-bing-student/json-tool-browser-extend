import {
    compressJsonInput,
    formatJsonInput,
    parseJsonInput,
    stringifyJsonValue,
    type JsonFormatResult,
    type JsonFormatterOptions,
    type JsonParseResult,
} from '../utils/jsonEngine';

interface ReadonlyValueRef<T> {
    readonly value: T;
}

interface UseJsonEngineCtx {
    indentSize: ReadonlyValueRef<number>;
    arrayNewLine: ReadonlyValueRef<boolean>;
    preserveNumberLiterals: ReadonlyValueRef<boolean>;
    encodingMode: ReadonlyValueRef<boolean>;
}

export interface JsonEngineRuntimeOptions {
    indentSize?: number;
    arrayNewLine?: boolean;
    preserveNumberLiterals?: boolean;
    encodingMode?: boolean;
}

export const useJsonEngine = (ctx: UseJsonEngineCtx) => {
    const resolveOptions = (options?: JsonEngineRuntimeOptions): JsonFormatterOptions => ({
        indentSize: options?.indentSize ?? ctx.indentSize.value,
        arrayNewLine: options?.arrayNewLine ?? ctx.arrayNewLine.value,
        preserveNumberLiterals: options?.preserveNumberLiterals ?? ctx.preserveNumberLiterals.value,
        encodingMode: options?.encodingMode ?? ctx.encodingMode.value,
    });

    const parse = (input: string, options?: JsonEngineRuntimeOptions): JsonParseResult => parseJsonInput(input, resolveOptions(options));

    const formatInput = (input: string, options?: JsonEngineRuntimeOptions): JsonFormatResult => formatJsonInput(input, resolveOptions(options));

    const compressInput = (input: string, options?: JsonEngineRuntimeOptions): JsonFormatResult => compressJsonInput(input, resolveOptions(options));

    const stringify = (
        data: any,
        escapeMap: Map<string, string> = new Map<string, string>(),
        options?: JsonEngineRuntimeOptions,
        compressed: boolean = false,
    ): string => stringifyJsonValue(data, escapeMap, resolveOptions(options), compressed);

    return {
        resolveOptions,
        parse,
        formatInput,
        compressInput,
        stringify,
    };
};
