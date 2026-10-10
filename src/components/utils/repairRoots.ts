const primitiveValue = /^(?:true|false|null|undefined|[+-]?(?:NaN|Infinity|0[xX][\da-fA-F]+|(?:(?:0|[1-9]\d*)(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?))$/;

const quoteEnd = (char: string): string | undefined =>
    char === '"' || char === "'" ? char : char === '“' ? '”' : char === '‘' ? '’' : undefined;

const skipString = (input: string, start: number): number => {
    const endQuote = quoteEnd(input[start]);
    let index = start + 1;
    while (index < input.length) {
        if (input[index] === '\\') { index = Math.min(index + 2, input.length); continue; }
        if (input[index++] === endQuote) break;
    }
    return index;
};

const skipComment = (input: string, index: number): number => {
    if (input[index] === '#' || (input[index] === '/' && input[index + 1] === '/' && input[index - 1] !== ':')) {
        const end = input.indexOf('\n', index + 1);
        return end < 0 ? input.length : end;
    }
    if (input[index] === '/' && input[index + 1] === '*') {
        const end = input.indexOf('*/', index + 2);
        return end < 0 ? input.length : end + 2;
    }
    return index;
};

const skipRegex = (input: string, start: number): number => {
    if (input[start] !== '/' || input[start + 1] === '/' || input[start + 1] === '*') return start;
    // A URL path or the second slash in https:// is not a regex opening delimiter.
    if (/[\p{L}\p{N}_$/]/u.test(input[start - 1] || '')) return start;
    let inCharacterClass = false;
    for (let index = start + 1; index < input.length; index++) {
        const char = input[index];
        if (char === '\n' || char === '\r') return index;
        if (char === '\\') { index++; continue; }
        if (char === '[') inCharacterClass = true;
        else if (char === ']') inCharacterClass = false;
        else if (char === '/' && !inCharacterClass) {
            index++;
            while (/[a-z]/i.test(input[index] || '') && index < input.length) index++;
            return index;
        }
    }
    // Keep malformed regex text together, too; avoid repeatedly rescanning an unterminated class.
    return input.length;
};

const containerEnd = (input: string, start: number): number => {
    let depth = 0, index = start;
    while (index < input.length) {
        const char = input[index];
        if (quoteEnd(char)) { index = skipString(input, index); continue; }
        const commentEnd = skipComment(input, index);
        if (commentEnd !== index) { index = commentEnd; continue; }
        const regexEnd = skipRegex(input, index);
        if (regexEnd !== index) { index = regexEnd; continue; }
        if (char === '{' || char === '[') depth++;
        else if (char === '}' || char === ']') {
            if (--depth === 0) return index + 1;
        }
        index++;
    }
    // Preserve a truncated container in full. The repair parser supplies missing closers.
    return input.length;
};

/** Keep root JSON values in source order; discard root text only when a container exists. */
export function selectRepairRoots(input: string): string {
    const values: string[] = [];
    let hasContainer = false, index = 0;
    while (index < input.length) {
        const char = input[index];
        if (/\s/.test(char) || char === ',' || char === ';') { index++; continue; }
        const commentEnd = skipComment(input, index);
        if (commentEnd !== index) { index = commentEnd; continue; }
        if (quoteEnd(char)) { index = skipString(input, index); continue; }
        const regexEnd = skipRegex(input, index);
        if (regexEnd !== index) { index = regexEnd; continue; }
        if (char === '{' || char === '[') {
            const end = containerEnd(input, index);
            values.push(input.slice(index, end));
            hasContainer = true;
            index = end;
            continue;
        }
        const start = index++;
        while (index < input.length) {
            const char = input[index];
            if (char === '\n' || char === '\r' || char === ',' || char === ';' || char === '{' || char === '[') break;
            if (skipComment(input, index) !== index) break;
            if (skipRegex(input, index) !== index) break;
            // An apostrophe inside a word (don't / it's) is part of the surrounding prose.
            if (quoteEnd(char) && (char !== "'" || !/[\p{L}\p{N}_]/u.test(input[index - 1]))) break;
            index++;
        }
        const text = input.slice(start, index);
        // A stray closer may be caused by an unescaped quote inside the container.
        // Let the repair parser handle the entire input instead of silently cutting off fields.
        if (/[}\]]/.test(text)) return input;
        const tokens = text.trim().split(/\s+/);
        if (tokens.every(token => primitiveValue.test(token))) {
            for (const token of tokens) values.push(token);
        }
    }
    if (!hasContainer) return input;
    return values.length === 1 ? values[0] : '[\n' + values.join(',\n') + '\n]';
}
