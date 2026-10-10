import { calculateMaxLevel } from './jsonStructure';
import { parseJsonInput } from './jsonEngine/service';
import type { JsonFormatterOptions } from './jsonEngine/types';

const WORKER_MIN_CHARS = 512 * 1024;
const WORKER_MIN_LINES = 10000;
const STRUCTURAL_SCAN_MIN_CHARS = 10 * 1024 * 1024;

export type JsonLevelAnalysisMode = 'compatible' | 'structural';

export interface JsonLevelAnalysisRequest {
    id: number;
    input: string;
    mode: JsonLevelAnalysisMode;
    options?: JsonFormatterOptions;
}

export interface JsonLevelAnalysisResponse {
    id: number;
    level?: number;
    error?: string;
}

export const getJsonLevelAnalysisPlan = (chars: number, lines: number) => ({
    useWorker: chars >= WORKER_MIN_CHARS || lines >= WORKER_MIN_LINES,
    mode: (chars > STRUCTURAL_SCAN_MIN_CHARS ? 'structural' : 'compatible') as JsonLevelAnalysisMode,
    delay: chars >= WORKER_MIN_CHARS || lines >= WORKER_MIN_LINES ? 800 : 150,
});

export const cleanJsonLevelAnalysisInput = (input: string) => input.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u0019]+/g, '');

/** The pre-existing lexical depth scan is reserved for inputs above 10 MiB. */
const calculateMaxLevelFromJsonLikeText = (input: string): number => {
    let level = 0;
    let maxLevel = 0;
    let inString = false;
    let stringChar = '';
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        const next = input[i + 1] || '';

        if (inLineComment) {
            if (char === '\n') inLineComment = false;
            continue;
        }
        if (inBlockComment) {
            if (char === '*' && next === '/') { i++; inBlockComment = false; }
            continue;
        }
        if (inString) {
            if (char === '\\' && next) { i++; continue; }
            if (char === stringChar) { inString = false; stringChar = ''; }
            continue;
        }
        if (char === '/' && next === '/') { i++; inLineComment = true; continue; }
        if (char === '/' && next === '*') { i++; inBlockComment = true; continue; }
        if (char === '#') { inLineComment = true; continue; }
        if (char === '"' || char === "'") { inString = true; stringChar = char; continue; }
        if (char === '{' || char === '[') {
            level++;
            if (level > maxLevel) maxLevel = level;
        } else if (char === '}' || char === ']') {
            level--;
            if (level < 0) throw new Error('JSON 结构括号不匹配');
        }
    }
    if (inString) throw new Error('JSON 字符串未闭合');
    if (inBlockComment) throw new Error('JSON 块注释未闭合');
    if (level !== 0) throw new Error('JSON 结构括号不匹配');
    return maxLevel;
};

/** Medium documents retain the same compatible parser and structure semantics as the inline path. */
export const analyzeJsonLevelInput = (input: string, mode: JsonLevelAnalysisMode, options?: JsonFormatterOptions): number => {
    if (mode === 'structural') return calculateMaxLevelFromJsonLikeText(input);
    const parserOptions = options ?? { indentSize: 2, arrayNewLine: true, preserveNumberLiterals: true, encodingMode: false };
    return calculateMaxLevel(parseJsonInput(cleanJsonLevelAnalysisInput(input), parserOptions).data);
};
