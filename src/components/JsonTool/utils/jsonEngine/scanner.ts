export const isIdentifierChar = (ch: string): boolean => /[A-Za-z0-9_$]/.test(ch);

const findLineCommentStart = (input: string, lineStart: number, lineEnd: number): number => {
    let inString = false;
    let stringChar = '';

    for (let i = lineStart; i <= lineEnd; i++) {
        const char = input[i];
        const next = input[i + 1] || '';

        if (inString) {
            if (char === '\\' && next) {
                i++;
                continue;
            }
            if (char === stringChar) {
                inString = false;
                stringChar = '';
            }
            continue;
        }

        if (char === '"' || char === "'") {
            inString = true;
            stringChar = char;
            continue;
        }

        if (char === '#') return i;
        if (char === '/' && next === '/') return i;
    }

    return -1;
};

export const getPreviousSignificantChar = (input: string, index: number): string => {
    let i = index - 1;

    while (i >= 0) {
        while (i >= 0 && /\s/.test(input[i])) i--;
        if (i < 0) return '';

        if (input[i] === '/' && input[i - 1] === '*') {
            const blockStart = input.lastIndexOf('/*', i - 2);
            if (blockStart !== -1) {
                i = blockStart - 1;
                continue;
            }
        }

        const lineStart = input.lastIndexOf('\n', i) + 1;
        const commentStart = findLineCommentStart(input, lineStart, i);
        if (commentStart !== -1 && commentStart <= i) {
            i = commentStart - 1;
            continue;
        }

        return input[i];
    }
    return '';
};

export const getNextSignificantChar = (input: string, index: number): string => {
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = index; i < input.length; i++) {
        const char = input[i];
        const next = input[i + 1] || '';

        if (inLineComment) {
            if (char === '\n') inLineComment = false;
            continue;
        }

        if (inBlockComment) {
            if (char === '*' && next === '/') {
                i++;
                inBlockComment = false;
            }
            continue;
        }

        if (/\s/.test(char)) continue;

        if (char === '/' && next === '/') {
            i++;
            inLineComment = true;
            continue;
        }

        if (char === '/' && next === '*') {
            i++;
            inBlockComment = true;
            continue;
        }

        if (char === '#') {
            inLineComment = true;
            continue;
        }

        return char;
    }
    return '';
};

export const isValuePosition = (input: string, start: number, end: number): boolean => {
    const prev = getPreviousSignificantChar(input, start);
    const next = getNextSignificantChar(input, end);

    // JSON5 允许裸 key，例如 undefined: 1 / Symbol: 1，这种位置不能按 value 处理。
    if (next === ':') return false;

    const canStartValue = prev === '' || prev === ':' || prev === '[' || prev === ',';
    const canEndValue = next === '' || next === ',' || next === ']' || next === '}';
    return canStartValue && canEndValue;
};
