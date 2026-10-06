import { isIdentifierChar, isValuePosition } from './scanner';

type ReplacementScanner = (input: string, index: number) => { replacement: string; nextIndex: number } | null;

const scanOutsideStringsAndComments = (input: string, scanner: ReplacementScanner): string => {
    let result = '';
    let i = 0;
    let inString = false;
    let stringChar = '';
    let inLineComment = false;
    let inBlockComment = false;

    while (i < input.length) {
        const char = input[i];
        const next = input[i + 1] || '';

        if (inLineComment) {
            result += char;
            if (char === '\n') inLineComment = false;
            i++;
            continue;
        }

        if (inBlockComment) {
            result += char;
            if (char === '*' && next === '/') {
                result += next;
                i += 2;
                inBlockComment = false;
                continue;
            }
            i++;
            continue;
        }

        if (inString) {
            result += char;
            if (char === '\\' && next) {
                result += next;
                i += 2;
                continue;
            }
            if (char === stringChar) {
                inString = false;
                stringChar = '';
            }
            i++;
            continue;
        }

        if (char === '/' && next === '/') {
            result += char + next;
            i += 2;
            inLineComment = true;
            continue;
        }

        if (char === '/' && next === '*') {
            result += char + next;
            i += 2;
            inBlockComment = true;
            continue;
        }

        if (char === '#') {
            result += char;
            i++;
            inLineComment = true;
            continue;
        }

        if (char === '"' || char === "'") {
            inString = true;
            stringChar = char;
            result += char;
            i++;
            continue;
        }

        const replacement = scanner(input, i);
        if (replacement) {
            result += replacement.replacement;
            i = replacement.nextIndex;
            continue;
        }

        result += char;
        i++;
    }

    return result;
};

export const replaceUndefinedValuesWithNull = (input: string): string => {
    const keyword = 'undefined';
    return scanOutsideStringsAndComments(input, (source, index) => {
        if (!source.startsWith(keyword, index)) return null;
        if (isIdentifierChar(source[index - 1] || '') || isIdentifierChar(source[index + keyword.length] || '')) return null;
        if (!isValuePosition(source, index, index + keyword.length)) return null;
        return { replacement: 'null', nextIndex: index + keyword.length };
    });
};

export const preprocessSpecialJsonValues = (input: string): string => {
    let result = input;
    if (result.includes('undefined')) {
        result = replaceUndefinedValuesWithNull(result);
    }
    return result;
};
