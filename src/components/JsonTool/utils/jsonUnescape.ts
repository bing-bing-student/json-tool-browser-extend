import {
    parseJsonInput,
    stringifyJsonValue,
    tryParseHighPrecisionWrapper,
    tryReadHighPrecisionWrapperObject,
    type JsonFormatterOptions,
} from './jsonEngine';
import { detectIllegalEscapes, detectInconsistentEscapeLevels } from './jsonStructure';

const DEFAULT_MAX_PARSE_ITERATIONS = 30;
const DEFAULT_MAX_DEPTH = 100;
const ESCAPE_PLACEHOLDER_START = '\uE000';
const ESCAPE_PLACEHOLDER_LENGTH = 14;

export type JsonUnescapeMessageKind = 'success' | 'shallow-success' | 'double-success' | 'not-detected';

export type JsonUnescapeErrorCode = 'illegal-escape' | 'invalid-json';

export interface JsonUnescapeOptions {
    recursive: boolean;
    indentSize: number;
    arrayNewLine: boolean;
    preserveNumberLiterals?: boolean;
    maxParseIterations?: number;
    maxDepth?: number;
}

export type JsonUnescapeResult =
    | {
          ok: true;
          text: string;
          messageKind: JsonUnescapeMessageKind;
          hasInconsistentEscape: boolean;
      }
    | {
          ok: false;
          code: JsonUnescapeErrorCode;
          hasInconsistentEscape: boolean;
      };

type ParseFailureReason = JsonUnescapeErrorCode;

type ParseLayerResult =
    | {
          ok: true;
          value: any;
      }
    | {
          ok: false;
          reason: ParseFailureReason;
      };

type StringExpandResult =
    | {
          expanded: true;
          value: any;
          layers: number;
      }
    | {
          expanded: false;
      };

interface JsonUnescapeContext {
    formatterOptions: JsonFormatterOptions;
    escapeMap: Map<string, string>;
    nextEscapePlaceholderId: number;
    maxParseIterations: number;
    maxDepth: number;
}

const createFormatterOptions = (options: JsonUnescapeOptions): JsonFormatterOptions => ({
    indentSize: options.indentSize,
    arrayNewLine: options.arrayNewLine,
    preserveNumberLiterals: options.preserveNumberLiterals ?? true,
    encodingMode: false,
});

const createContext = (options: JsonUnescapeOptions): JsonUnescapeContext => ({
    formatterOptions: createFormatterOptions(options),
    escapeMap: new Map<string, string>(),
    nextEscapePlaceholderId: 0,
    maxParseIterations: options.maxParseIterations ?? DEFAULT_MAX_PARSE_ITERATIONS,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
});

// 生成与 formatter 兼容的 14 字符 escape placeholder，仅用于跨层 key 冲突兜底。
const createContextEscapePlaceholder = (ctx: JsonUnescapeContext): string => {
    let value = ctx.nextEscapePlaceholderId++;
    let placeholder = ESCAPE_PLACEHOLDER_START;
    for (let i = 1; i < ESCAPE_PLACEHOLDER_LENGTH; i++) {
        placeholder += String.fromCharCode(0xe001 + (value & 0x7ff));
        value = value >>> 11;
    }
    return placeholder;
};

const allocateEscapePlaceholder = (ctx: JsonUnescapeContext, originalEscape: string, occupiedText: string): string => {
    let placeholder = createContextEscapePlaceholder(ctx);
    while (ctx.escapeMap.has(placeholder) || occupiedText.includes(placeholder)) {
        placeholder = createContextEscapePlaceholder(ctx);
    }
    ctx.escapeMap.set(placeholder, originalEscape);
    return placeholder;
};

const replaceEscapePlaceholdersInString = (value: string, placeholderMap: Map<string, string>): string => {
    let output = value;
    for (const [sourcePlaceholder, targetPlaceholder] of placeholderMap) {
        if (sourcePlaceholder !== targetPlaceholder && output.includes(sourcePlaceholder)) {
            output = output.split(sourcePlaceholder).join(targetPlaceholder);
        }
    }
    return output;
};

const replaceEscapePlaceholdersInValue = (value: any, placeholderMap: Map<string, string>): any => {
    if (typeof value === 'string') {
        return replaceEscapePlaceholdersInString(value, placeholderMap);
    }
    if (Array.isArray(value)) {
        return value.map((item) => replaceEscapePlaceholdersInValue(item, placeholderMap));
    }
    if (value && typeof value === 'object') {
        const output: Record<string, any> = {};
        for (const key of Object.keys(value)) {
            output[replaceEscapePlaceholdersInString(key, placeholderMap)] = replaceEscapePlaceholdersInValue(value[key], placeholderMap);
        }
        return output;
    }
    return value;
};

// 复用 parser 返回的完整 placeholder，避免去除转义阶段泄漏内部私有区字符。
const registerParsedEscapes = (ctx: JsonUnescapeContext, value: any, sourceEscapeMap: Map<string, string>): any => {
    if (sourceEscapeMap.size === 0) return value;

    const occupiedText = JSON.stringify(value) ?? '';
    const placeholderMap = new Map<string, string>();
    let needsRemap = false;
    for (const [sourcePlaceholder, originalEscape] of sourceEscapeMap) {
        const existingEscape = ctx.escapeMap.get(sourcePlaceholder);
        if (existingEscape === undefined || existingEscape === originalEscape) {
            ctx.escapeMap.set(sourcePlaceholder, originalEscape);
            placeholderMap.set(sourcePlaceholder, sourcePlaceholder);
        } else {
            placeholderMap.set(sourcePlaceholder, allocateEscapePlaceholder(ctx, originalEscape, occupiedText));
            needsRemap = true;
        }
    }

    return needsRemap ? replaceEscapePlaceholdersInValue(value, placeholderMap) : value;
};

const parseJsonLayer = (ctx: JsonUnescapeContext, source: string, rejectIllegalEscapes: boolean): ParseLayerResult => {
    if (rejectIllegalEscapes && detectIllegalEscapes(source).hasIllegal) {
        return { ok: false, reason: 'illegal-escape' };
    }

    try {
        const parsed = parseJsonInput(source, ctx.formatterOptions);
        return {
            ok: true,
            value: registerParsedEscapes(ctx, parsed.data, parsed.escapeMap),
        };
    } catch {
        return { ok: false, reason: 'invalid-json' };
    }
};

const decodeJsonStringLiteral = (ctx: JsonUnescapeContext, source: string): ParseLayerResult => {
    if (detectIllegalEscapes(source).hasIllegal) {
        return { ok: false, reason: 'illegal-escape' };
    }

    const parsed = parseJsonLayer(ctx, `"${source}"`, true);
    if (!parsed.ok || typeof parsed.value !== 'string') {
        return parsed.ok ? { ok: false, reason: 'invalid-json' } : parsed;
    }
    return parsed;
};

const isJsonContainerDocument = (value: string): boolean => {
    const trimmed = value.trim();
    return trimmed.length >= 2 && ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']')));
};

const isJsonValueDocument = (value: string): boolean => {
    const trimmed = value.trim();
    if (!trimmed) return false;
    return (
        isJsonContainerDocument(trimmed) ||
        trimmed.startsWith('"') ||
        trimmed === 'true' ||
        trimmed === 'false' ||
        trimmed === 'null' ||
        /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)
    );
};

const looksLikeEscapedJsonContainer = (value: string): boolean => value.includes('\\"');

const isHighPrecisionValue = (value: any): boolean => {
    if (typeof value === 'string') {
        return tryParseHighPrecisionWrapper(value) !== null;
    }
    return tryReadHighPrecisionWrapperObject(value) !== null;
};

const tryExpandStringOnce = (ctx: JsonUnescapeContext, source: string, mode: 'top-level' | 'nested'): StringExpandResult => {
    if (!source.trim() || isHighPrecisionValue(source)) {
        return { expanded: false };
    }

    const trimmed = source.trim();
    const allowDirectParse = mode === 'top-level' ? isJsonValueDocument(trimmed) : isJsonContainerDocument(trimmed);

    if (allowDirectParse) {
        const direct = parseJsonLayer(ctx, trimmed, true);
        if (direct.ok) {
            return { expanded: true, value: direct.value, layers: 1 };
        }
        if (direct.reason === 'illegal-escape') {
            return { expanded: false };
        }
    }

    if (!looksLikeEscapedJsonContainer(trimmed)) {
        return { expanded: false };
    }

    const decoded = decodeJsonStringLiteral(ctx, trimmed);
    if (!decoded.ok) {
        return { expanded: false };
    }
    if (typeof decoded.value !== 'string' || decoded.value === source) {
        return { expanded: false };
    }

    const decodedTrimmed = decoded.value.trim();
    if (mode === 'nested' && !isJsonContainerDocument(decodedTrimmed)) {
        return { expanded: false };
    }

    const parsedDecoded = parseJsonLayer(ctx, decodedTrimmed, true);
    if (parsedDecoded.ok) {
        return { expanded: true, value: parsedDecoded.value, layers: 2 };
    }

    if (mode === 'top-level') {
        return { expanded: true, value: decoded.value, layers: 1 };
    }

    return { expanded: false };
};

const expandTopLevelString = (ctx: JsonUnescapeContext, source: string, recursive: boolean): { value: any; layers: number } => {
    let current: any = source;
    let layers = 0;
    const maxIterations = recursive ? ctx.maxParseIterations : 1;

    for (let i = 0; i < maxIterations; i++) {
        if (typeof current !== 'string') break;
        const expanded = tryExpandStringOnce(ctx, current, 'top-level');
        if (!expanded.expanded || expanded.value === current) break;
        current = expanded.value;
        layers += expanded.layers;
    }

    return { value: current, layers };
};

const expandNestedString = (ctx: JsonUnescapeContext, source: string, recursive: boolean, depth: number): { value: any; layers: number } => {
    let current: any = source;
    let layers = 0;
    const maxIterations = recursive ? ctx.maxParseIterations : 1;

    for (let i = 0; i < maxIterations; i++) {
        if (typeof current !== 'string') break;
        const expanded = tryExpandStringOnce(ctx, current, 'nested');
        if (!expanded.expanded || expanded.value === current) break;
        current = expanded.value;
        layers += expanded.layers;

        if (!recursive) break;
        if (current && typeof current === 'object') {
            current = processValue(ctx, current, true, depth + 1);
            break;
        }
    }

    return { value: current, layers };
};

const processValue = (ctx: JsonUnescapeContext, value: any, recursive: boolean, depth: number): any => {
    if (depth > ctx.maxDepth || value === null || value === undefined || isHighPrecisionValue(value)) {
        return value;
    }

    if (typeof value === 'string') {
        return expandNestedString(ctx, value, recursive, depth).value;
    }

    if (Array.isArray(value)) {
        return value.map((item) => processValue(ctx, item, recursive, depth + 1));
    }

    if (typeof value === 'object') {
        const output: Record<string, any> = {};
        for (const key of Object.keys(value)) {
            output[key] = processValue(ctx, value[key], recursive, depth + 1);
        }
        return output;
    }

    return value;
};

const resolveMessageKind = (recursive: boolean, topLevelLayers: number): JsonUnescapeMessageKind => {
    if (!recursive) return 'shallow-success';
    if (topLevelLayers >= 2) return 'double-success';
    return 'success';
};

export const unescapeJsonText = (input: string, options: JsonUnescapeOptions): JsonUnescapeResult => {
    const hasInconsistentEscape = detectInconsistentEscapeLevels(input);

    if (detectIllegalEscapes(input).hasIllegal) {
        return {
            ok: false,
            code: 'illegal-escape',
            hasInconsistentEscape,
        };
    }

    const ctx = createContext(options);
    const parsedInput = parseJsonLayer(ctx, input, false);
    if (!parsedInput.ok) {
        return {
            ok: false,
            code: 'invalid-json',
            hasInconsistentEscape,
        };
    }

    let processed = parsedInput.value;
    let topLevelLayers = 0;

    if (typeof processed === 'string') {
        const expanded = expandTopLevelString(ctx, processed, options.recursive);
        processed = expanded.value;
        topLevelLayers = expanded.layers;

        if (options.recursive && processed && typeof processed === 'object') {
            processed = processValue(ctx, processed, true, 0);
        }
    } else if (processed && typeof processed === 'object') {
        processed = processValue(ctx, processed, options.recursive, 0);
    }

    return {
        ok: true,
        text: stringifyJsonValue(processed, ctx.escapeMap, ctx.formatterOptions),
        messageKind: resolveMessageKind(options.recursive, topLevelLayers),
        hasInconsistentEscape,
    };
};
