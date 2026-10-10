import { JsonPlusFormatter } from './jsonEngine/formatter';
import { parseJsonInput, stringifyJsonValue } from './jsonEngine/service';
import { JsonInputParseError, type JsonFormatterOptions } from './jsonEngine/types';
import { selectRepairRoots } from './repairRoots';
import { findStringBoundaryRepair, insertMissingObjectCommas } from './repairStringBoundaries';
import { findEmbeddedJsonStringRepair } from './repairEmbeddedJsonStrings';

export type FormatStage = 'parsing' | 'repairing' | 'formatting' | 'saving';
export interface RepairFormatResult { formatted: string; repaired?: string }

// Only rewrite complete value tokens, outside strings/comments. Never coerce keys or string contents.
export function normalizeRepairValues(input: string): string {
    if (!/(?:NaN|Infinity|undefined|0[xX][\da-fA-F]|\+(?:\d|\.\d))/.test(input)) return input;
    const parts: string[] = [];
    let start = 0, i = 0;
    let previousTokenStart = 0, previousTokenEnd = 0;
    const valueToken = /(?:[+-]?Infinity|[+-]?NaN|undefined|[+-]?0[xX][\da-fA-F]+|\+(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/y;
    const canStartPositiveNumber = (): boolean => {
        if (!previousTokenEnd) return true;
        const previousChar = input[previousTokenEnd - 1];
        if (/[:\[,\]}"'”’]/.test(previousChar)) return true;
        // A preceding complete value may be an array item whose comma is missing.
        // Do not remove '+' from the middle of an unquoted phrase such as `hello +99`.
        return /^(?:true|false|null|undefined|[+-]?(?:NaN|Infinity|0[xX][\da-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?))$/.test(input.slice(previousTokenStart, previousTokenEnd));
    };
    while (i < input.length) {
        const ch = input[i];
        if (ch === '"' || ch === "'" || ch === '“' || ch === '‘') {
            const endQuote = ch === '“' ? '”' : ch === '‘' ? '’' : ch;
            previousTokenStart = i;
            i++;
            while (i < input.length) {
                if (input[i] === '\\') { i += 2; continue; }
                if (input[i++] === endQuote) break;
            }
            previousTokenEnd = i;
            continue;
        }
        if (ch === '#' || (ch === '/' && input[i + 1] === '/' && input[i - 1] !== ':')) {
            while (i < input.length && input[i] !== '\n') i++;
            continue;
        }
        if (ch === '/' && input[i + 1] === '*') {
            const end = input.indexOf('*/', i + 2); i = end < 0 ? input.length : end + 2; continue;
        }
        if (!/[\w$]/.test(input[i - 1] || '') && /[+\-NIu0]/.test(ch)) {
            valueToken.lastIndex = i;
            const token = valueToken.exec(input)?.[0];
            const isPositiveNumber = token !== undefined && /^\+(?:\d|\.)/.test(token);
            if (token && !/[\w$.]/.test(input[i + token.length] || '') && (!isPositiveNumber || canStartPositiveNumber())) {
                let end = i + token.length;
                while (/\s/.test(input[end] || '') && end < input.length) end++;
                if (input[end] !== ':') {
                    // Strip a JSON5 leading plus without passing through Number, which loses precision.
                    const value = token.includes('0x') || token.includes('0X')
                        ? BigInt(token.replace(/^\+/, '').replace(/^-/, '')).toString()
                        : isPositiveNumber ? token.slice(1) : 'null';
                    const replacement = token.startsWith('-') && value !== 'null' ? '-' + value : value;
                    parts.push(input.slice(start, i), replacement);
                    previousTokenStart = i; i += token.length; previousTokenEnd = i;
                    start = i; continue;
                }
            }
        }
        if (!/\s/.test(ch)) {
            if (previousTokenEnd !== i || /[{}\[\]:,]/.test(ch) || /[{}\[\]:,]/.test(input[i - 1] || '')) previousTokenStart = i;
            previousTokenEnd = i + 1;
        }
        i++;
    }
    parts.push(input.slice(start));
    return parts.join('');
}

export async function formatWithOptionalRepair(
    input: string, options: JsonFormatterOptions, repairEnabled: boolean,
    onStage: (stage: FormatStage) => void = () => {},
): Promise<RepairFormatResult> {
    onStage('parsing');
    let parsed;
    try {
        parsed = parseJsonInput(input, options);
    } catch (error) {
        // A formatter/stack/memory error is not a syntax error and must not trigger another expensive parse.
        if (!repairEnabled || !(error instanceof JsonInputParseError)) throw error;
        onStage('repairing');
        const boundaryCandidate = findStringBoundaryRepair(input);
        if (boundaryCandidate !== undefined) {
            // A second syntax error must not discard an otherwise clear string boundary.
            // Complete only definite object separators, then validate the combined edit once.
            const boundaryRepair = insertMissingObjectCommas(boundaryCandidate);
            let boundaryParsed;
            try {
                // Validate before root selection: surrounding text must not hide a real closing quote.
                boundaryParsed = parseJsonInput(boundaryRepair, options);
            } catch (candidateError) {
                if (!(candidateError instanceof JsonInputParseError)) throw candidateError;
            }
            if (boundaryParsed) {
                onStage('formatting');
                return { repaired: boundaryRepair, formatted: stringifyJsonValue(boundaryParsed.data, boundaryParsed.escapeMap, options) };
            }
        }
        const embeddedRepair = findEmbeddedJsonStringRepair(input);
        if (embeddedRepair !== undefined) {
            const embeddedParsed = parseJsonInput(embeddedRepair, options);
            onStage('formatting');
            return { repaired: embeddedRepair, formatted: stringifyJsonValue(embeddedParsed.data, embeddedParsed.escapeMap, options) };
        }
        const { jsonrepair } = await import('jsonrepair');
        const protector = new JsonPlusFormatter(false, options.indentSize, options.arrayNewLine, true);
        const protectedInput = protector.prepareRepairInput(normalizeRepairValues(selectRepairRoots(input)));
        let repaired: string;
        try { repaired = jsonrepair(protectedInput.text); }
        catch (error) {
            // Offsets in protected text do not refer to the original editor. Do not expose them as original locations.
            const message = error instanceof Error ? error.message : String(error);
            throw new Error('JSON repair failed: ' + message.replace(/ at position \d+/, ''));
        }
        repaired = protector.restoreRepairEscapes(repaired, protectedInput.escapeMap);
        onStage('parsing');
        parsed = parseJsonInput(repaired, options);
        onStage('formatting');
        return { repaired, formatted: stringifyJsonValue(parsed.data, parsed.escapeMap, options) };
    }
    onStage('formatting');
    return { formatted: stringifyJsonValue(parsed.data, parsed.escapeMap, options) };
}
