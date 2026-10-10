const quoteEnd = (char: string): string | undefined =>
    char === '"' || char === "'" ? char : char === '“' ? '”' : char === '‘' ? '’' : undefined;

const isWhitespace = (char: string): boolean => char !== '' && /\s/.test(char);

function skipComment(input: string, start: number): number {
    if (input[start] === '#' || (input[start] === '/' && input[start + 1] === '/')) {
        const end = input.indexOf('\n', start + 1);
        return end < 0 ? input.length : end;
    }
    if (input[start] === '/' && input[start + 1] === '*') {
        const end = input.indexOf('*/', start + 2);
        return end < 0 ? input.length : end + 2;
    }
    return start;
}

function skipTrivia(input: string, start: number): number {
    let index = start;
    while (index < input.length) {
        if (isWhitespace(input[index])) { index++; continue; }
        const end = skipComment(input, index);
        if (end === index) break;
        index = end;
    }
    return index;
}

function skipEscape(input: string, start: number): number {
    // The compatible parser also accepts backslash + spaces + a line break as a continuation.
    let next = start + 1;
    while (input[next] === ' ' || input[next] === '\t') next++;
    if (input[next] === '\r' || input[next] === '\n') {
        return next + (input[next] === '\r' && input[next + 1] === '\n' ? 2 : 1);
    }
    return Math.min(start + 2, input.length);
}

function skipRegex(input: string, start: number): number {
    if (input[start] !== '/' || /[\p{L}\p{N}_$/]/u.test(input[start - 1] || '')) return start;
    let inClass = false;
    for (let index = start + 1; index < input.length; index++) {
        const char = input[index];
        if (char === '\n' || char === '\r') return index;
        if (char === '\\') { index++; continue; }
        if (char === '[') inClass = true;
        else if (char === ']') inClass = false;
        else if (char === '/' && !inClass) {
            index++;
            while (/[a-z]/i.test(input[index] || '') && index < input.length) index++;
            return index;
        }
    }
    return input.length;
}

function isObjectKey(input: string, start: number): boolean {
    const endQuote = quoteEnd(input[start]);
    let index = start;
    if (endQuote) {
        index++;
        while (index < input.length && input[index] !== endQuote) {
            if (input[index] === '\n' || input[index] === '\r') return false;
            index = input[index] === '\\' ? skipEscape(input, index) : index + 1;
        }
        if (input[index] !== endQuote) return false;
        index++;
    } else {
        if (!/[\p{L}_$]/u.test(input[index] || '')) return false;
        while (/[\p{L}\p{N}_$]/u.test(input[index] || '') && index < input.length) index++;
    }
    return input[skipTrivia(input, index)] === ':';
}

function closingBoundary(input: string, newline: number, stack: string[]): { end: number; matches: boolean } {
    let index = newline;
    while (isWhitespace(input[index] || '')) index++;
    if (input[index] !== '}' && input[index] !== ']') return { end: index, matches: false };
    let depth = stack.length;
    while (index < input.length) {
        const char = input[index];
        if (char === '}' || char === ']') {
            if (stack[depth - 1] !== (char === '}' ? '{' : '[')) return { end: index, matches: false };
            depth--;
            index++;
        } else if (char === ',' || isWhitespace(char)) index++;
        else break;
    }
    if (index === input.length) return { end: index, matches: depth === 0 };
    const matches = depth > 0 && (stack[depth - 1] === '{'
        ? isObjectKey(input, index)
        : /[\[\{"'“‘\d+\-]/.test(input[index]) || /^(?:true|false|null)\b/.test(input.slice(index, index + 6)));
    return { end: index, matches };
}

function looksLikeExistingEndQuote(input: string, quote: number): boolean {
    const next = skipTrivia(input, quote + 1);
    const char = input[next];
    // A real close must survive even if a comma is missing before the next value/key.
    return next === input.length || char === ',' || char === '}' || char === ']'
        || char === ':' || quoteEnd(char) !== undefined || /[\d+\-\[{]/.test(char || '')
        || /^(?:true|false|null)\b/.test(input.slice(next, next + 6)) || isObjectKey(input, next);
}

/**
 * Find at most one quote insertion before matching container closers. This is only a
 * candidate: the caller must parse the ENTIRE input successfully before applying it.
 * Looking ahead through a closing run once keeps large multiline strings linear.
 */
export function findStringBoundaryRepair(input: string): string | undefined {
    const stack: string[] = [];
    let index = 0, previous = '';
    while (index < input.length) {
        const char = input[index];
        if (isWhitespace(char)) { index++; continue; }
        const commentEnd = skipComment(input, index);
        if (commentEnd !== index) { index = commentEnd; continue; }
        const regexEnd = skipRegex(input, index);
        if (regexEnd !== index) { index = regexEnd; previous = '/'; continue; }
        const endQuote = quoteEnd(char);
        if (endQuote) {
            const isValue = previous === ':' || (stack[stack.length - 1] === '[' && (previous === '[' || previous === ','));
            let boundary = -1;
            index++;
            while (index < input.length) {
                if (input[index] === '\\') { index = skipEscape(input, index); continue; }
                if (input[index] === endQuote) {
                    if (boundary >= 0 && !looksLikeExistingEndQuote(input, index)) {
                        return input.slice(0, boundary) + endQuote + input.slice(boundary);
                    }
                    index++;
                    break;
                }
                if (isValue && boundary < 0 && (input[index] === '\n' || input[index] === '\r')) {
                    const candidate = closingBoundary(input, index, stack);
                    if (candidate.matches) boundary = index;
                    // Runs contain only closers, commas and whitespace; no escapes or quotes are skipped.
                    if (candidate.end > index) { index = candidate.end; continue; }
                }
                index++;
            }
            if (boundary >= 0 && index === input.length && input[index - 1] !== endQuote) {
                return input.slice(0, boundary) + endQuote + input.slice(boundary);
            }
            previous = endQuote;
            continue;
        }
        if (char === '{' || char === '[') stack.push(char);
        else if (char === '}' || char === ']') {
            if (stack[stack.length - 1] !== (char === '}' ? '{' : '[')) return undefined;
            stack.pop();
        }
        previous = char;
        index++;
    }
    return undefined;
}

type Container = { char: '{' | '['; state: 'key' | 'colon' | 'value' | 'separator'; valueEnd: number };
const completePrimitive = /^(?:true|false|null|undefined|[+-]?(?:NaN|Infinity|0[xX][\da-fA-F]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?))$/;

function closedStringEnd(input: string, start: number): number | undefined {
    const endQuote = quoteEnd(input[start]);
    let index = start + 1;
    while (index < input.length) {
        if (input[index] === '\\') { index = skipEscape(input, index); continue; }
        if (input[index] === endQuote) return index + 1;
        index++;
    }
    return undefined;
}

/**
 * Complete object separators only between an already finished value and a definite
 * next key. All other syntax is left to the existing repair parser. If token/state
 * recognition fails, discard every insertion; the caller still validates the full
 * quote + comma candidate before using it.
 */
export function insertMissingObjectCommas(input: string): string {
    const stack: Container[] = [];
    const parts: string[] = [];
    let index = 0, start = 0, rootStarted = false;
    while (index < input.length) {
        index = skipTrivia(input, index);
        if (index === input.length) break;
        const char = input[index];
        const frame = stack[stack.length - 1];
        if (frame?.char === '{' && frame.state === 'separator' && isObjectKey(input, index)) {
            parts.push(input.slice(start, frame.valueEnd), ',');
            start = frame.valueEnd;
            frame.state = 'key';
        }
        if (char === '{' || char === '[') {
            if (frame ? frame.state !== 'value' : rootStarted) return input;
            rootStarted = true;
            stack.push({ char, state: char === '{' ? 'key' : 'value', valueEnd: -1 });
            index++;
            continue;
        }
        if (!frame) return input;
        if (char === '}' || char === ']') {
            if (frame.char !== (char === '}' ? '{' : '[') || frame.state === 'colon'
                || (frame.char === '{' && frame.state === 'value')) return input;
            stack.pop();
            index++;
            const parent = stack[stack.length - 1];
            if (parent) { parent.state = 'separator'; parent.valueEnd = index; }
            continue;
        }
        if (char === ',') {
            if (frame.state !== 'separator') return input;
            frame.state = frame.char === '{' ? 'key' : 'value';
            index++;
            continue;
        }
        if (frame.state === 'colon') {
            if (char !== ':') return input;
            frame.state = 'value';
            index++;
            continue;
        }
        if (frame.state === 'key') {
            if (!isObjectKey(input, index)) return input;
            if (quoteEnd(char)) {
                const end = closedStringEnd(input, index);
                if (end === undefined) return input;
                index = end;
            } else {
                while (/[\p{L}\p{N}_$]/u.test(input[index] || '') && index < input.length) index++;
            }
            frame.state = 'colon';
            continue;
        }
        if (frame.state !== 'value') return input;
        if (quoteEnd(char)) {
            const end = closedStringEnd(input, index);
            if (end === undefined) return input;
            index = end;
        } else {
            const tokenStart = index;
            // Unknown values (including expressions/regex/URLs) are deliberately not split.
            while (index < input.length && !isWhitespace(input[index]) && !/[{}\[\],:"'“‘/#]/.test(input[index])) index++;
            if (!completePrimitive.test(input.slice(tokenStart, index))) return input;
        }
        frame.state = 'separator';
        frame.valueEnd = index;
    }
    if (stack.length || !parts.length) return input;
    parts.push(input.slice(start));
    return parts.join('');
}
