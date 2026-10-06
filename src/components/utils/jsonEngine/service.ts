import { JsonPlusFormatter } from './formatter';
import type { JsonFormatResult, JsonFormatterOptions, JsonParseResult } from './types';

const createFormatter = (options: JsonFormatterOptions): JsonPlusFormatter =>
    new JsonPlusFormatter(options.encodingMode ?? false, options.indentSize, options.arrayNewLine, options.preserveNumberLiterals);

export const parseJsonInput = (input: string, options: JsonFormatterOptions): JsonParseResult => {
    const formatter = createFormatter(options);
    const result = formatter.parseJson5(input);
    return {
        ...result,
        originalString: input,
    };
};

export const stringifyJsonValue = (
    data: any,
    escapeMap: Map<string, string>,
    options: JsonFormatterOptions,
    compressed: boolean = false,
): string => {
    const formatter = createFormatter(options);
    return compressed ? formatter.compress(data, escapeMap) : formatter.format(data, escapeMap);
};

export const formatJsonInput = (input: string, options: JsonFormatterOptions): JsonFormatResult => {
    const formatter = createFormatter(options);
    const parsed = {
        ...formatter.parseJson5(input),
        originalString: input,
    };
    return {
        ...parsed,
        formatted: formatter.format(parsed.data, parsed.escapeMap),
    };
};

export const compressJsonInput = (input: string, options: JsonFormatterOptions): JsonFormatResult => {
    const formatter = createFormatter(options);
    const parsed = {
        ...formatter.parseJson5(input),
        originalString: input,
    };
    return {
        ...parsed,
        formatted: formatter.compress(parsed.data, parsed.escapeMap),
    };
};
