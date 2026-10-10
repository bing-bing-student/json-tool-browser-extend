type Frame = {
    end: '}' | ']';
    state: 'key' | 'colon' | 'value' | 'separator';
    canCloseEmpty: boolean;
};

const whitespace = (char: string): boolean => char === ' ' || char === '\t' || char === '\r' || char === '\n';
const numberToken = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const simpleEscapes: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
const identifierStart = /[$_\p{ID_Start}]/u;
const identifierContinue = /[$_\u200C\u200D\p{ID_Continue}]/u;

function skipWhitespace(input: string, index: number): number {
    while (whitespace(input[index])) index++;
    return index;
}

function stringEnd(input: string, start: number): number | undefined {
    for (let index = start + 1; index < input.length; index++) {
        if (input[index] === '\\') { index++; continue; }
        if (input[index] === '"') return index + 1;
    }
    return undefined;
}

function skipCompatibleTrivia(input: string, start: number): number {
    let index = start;
    while (index < input.length) {
        if (/\s/.test(input[index])) { index++; continue; }
        if (input[index] === '#' || input.startsWith('//', index)) {
            while (index < input.length && !/[\n\r\u2028\u2029]/.test(input[index])) index++;
            continue;
        }
        if (input.startsWith('/*', index)) {
            const end = input.indexOf('*/', index + 2);
            if (end < 0) return input.length;
            index = end + 2;
            continue;
        }
        break;
    }
    return index;
}

function identifierCharacter(input: string, index: number): { char: string; end: number } | undefined {
    if (input[index] === '\\') {
        if (input[index + 1] !== 'u' || !/^[0-9a-fA-F]{4}$/.test(input.slice(index + 2, index + 6))) return undefined;
        return { char: String.fromCharCode(parseInt(input.slice(index + 2, index + 6), 16)), end: index + 6 };
    }
    const point = input.codePointAt(index);
    if (point === undefined) return undefined;
    const char = String.fromCodePoint(point);
    return { char, end: index + char.length };
}

function looksLikeCompatibleToken(input: string, start: number): boolean {
    let character = identifierCharacter(input, start);
    if (!character || !identifierStart.test(character.char)) return false;
    let index = character.end;
    while ((character = identifierCharacter(input, index)) && identifierContinue.test(character.char)) index = character.end;
    const next = skipCompatibleTrivia(input, index);
    // A bare key, bare value, or wrapper call after an ordinary close belongs to
    // the outer repair grammar. Never fold such tokens into an inner string.
    return next === input.length || ':,]}('.includes(input[next]);
}

function looksLikeOuterEnd(input: string, end: number): boolean {
    // The caller's compatible parser accepts more trivia than strict JSON. Such
    // trivia must protect an existing close, even though this helper will later
    // decline the entire non-strict document rather than move it into a string.
    let next = end;
    while (next < input.length && /\s/.test(input[next])) next++;
    if (input[next] === '#' || input.startsWith('//', next) || input.startsWith('/*', next)) return true;
    const char = input[next];
    // Protect existing strings before looking for embedded JSON. Even a complete
    // inner/outer parse could otherwise merge ["[", true, "]", damagedPayload].
    return next === input.length || char === ',' || char === '}' || char === ']'
        || char === ':' || char === ';' || char === '/' || char === '"' || char === "'" || char === '“' || char === '‘' || char === '{' || char === '['
        || /[\d+\-]/.test(char || '') || (char === '.' && /\d/.test(input[next + 1] || ''))
        || /^(?:true|false|null|undefined|NaN|Infinity)\b/.test(input.slice(next, next + 10))
        || looksLikeCompatibleToken(input, next);
}

/** Read one OUTER escape. The resulting character belongs to the inner JSON lexer. */
function decodedCharacter(input: string, index: number): { char: string; end: number } | undefined {
    const char = input[index];
    if (char !== '\\') return { char, end: index + 1 };
    const escaped = input[index + 1];
    if (Object.prototype.hasOwnProperty.call(simpleEscapes, escaped)) return { char: simpleEscapes[escaped], end: index + 2 };
    if (escaped === 'u' && /^[0-9a-fA-F]{4}$/.test(input.slice(index + 2, index + 6))) {
        return { char: String.fromCharCode(parseInt(input.slice(index + 2, index + 6), 16)), end: index + 6 };
    }
    return undefined;
}

function insertEscapes(input: string, positions: number[], start: number, end: number): string {
    const parts: string[] = [];
    for (const position of positions) {
        parts.push(input.slice(start, position), '\\');
        start = position;
    }
    parts.push(input.slice(start, end));
    return parts.join('');
}

function parsesStrictJson(input: string): boolean {
    try { JSON.parse(input); return true; }
    catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        return false;
    }
}

function embeddedString(input: string, start: number): { end: number; positions: number[] } | undefined {
    const containers: string[] = [];
    const positions: number[] = [];
    let index = start + 1, started = false, inString = false, innerEscape = false;
    while (index < input.length) {
        const decoded = decodedCharacter(input, index);
        if (!decoded) return undefined;
        const { char, end } = decoded;
        if (!started) {
            if (whitespace(char)) { index = end; continue; }
            if (char !== '{' && char !== '[') return undefined;
            started = true;
        }
        if (input[index] === '"') {
            // A first missing escape at an inner string's END can also be a real
            // outer end followed by sibling fields. Do not infer that boundary.
            if (!positions.length && inString) return undefined;
            positions.push(index);
        }
        if (inString) {
            if (innerEscape) innerEscape = false;
            else if (char === '\\') innerEscape = true;
            else if (char === '"') inString = false;
        } else if (char === '"') inString = true;
        else if (char === '{' || char === '[') containers.push(char);
        else if (char === '}' || char === ']') {
            if (containers.pop() !== (char === '}' ? '{' : '[')) return undefined;
            if (!containers.length) {
                // The FIRST complete container must finish this outer value.
                // Never search later closers or discard a suffix to make it parse.
                index = end;
                while (index < input.length && input[index] !== '"') {
                    const trailing = decodedCharacter(input, index);
                    if (!trailing || !whitespace(trailing.char)) return undefined;
                    index = trailing.end;
                }
                if (input[index] !== '"' || !positions.length) return undefined;
                const outerEnd = index + 1;
                const literal = insertEscapes(input, positions, start, outerEnd);
                let inner: string;
                try { inner = JSON.parse(literal); }
                catch (error) {
                    if (!(error instanceof SyntaxError)) throw error;
                    return undefined;
                }
                // Validation only: reserializing would change whitespace, large
                // numbers, duplicate keys, and the payload's encoding layers.
                if (!parsesStrictJson(inner)) return undefined;
                return { end: outerEnd, positions };
            }
        }
        index = end;
    }
    return undefined;
}

/**
 * Add missing quote escapes only in complete JSON-container STRING values of a
 * strict outer object/array. All other tokens and existing escapes stay verbatim.
 * Reject the entire edit if either container syntax or any outer token is unclear.
 * This helper is called only after the existing compatible parser has failed.
 */
export function findEmbeddedJsonStringRepair(input: string): string | undefined {
    const stack: Frame[] = [];
    const positions: number[] = [];
    let index = skipWhitespace(input, 0), rootFinished = false;
    if (input[index] !== '{' && input[index] !== '[') return undefined;
    const finishValue = (): void => {
        const parent = stack[stack.length - 1];
        if (parent) parent.state = 'separator';
        else rootFinished = true;
    };
    while (index < input.length) {
        index = skipWhitespace(input, index);
        if (index === input.length) break;
        const frame = stack[stack.length - 1];
        const char = input[index];
        if (rootFinished) return undefined;
        if (frame && char === frame.end) {
            const emptyStart = frame.canCloseEmpty && frame.state === (frame.end === '}' ? 'key' : 'value');
            if (frame.state !== 'separator' && !emptyStart) return undefined;
            stack.pop(); index++;
            finishValue();
            continue;
        }
        if (frame?.state === 'separator') {
            if (char !== ',') return undefined;
            frame.state = frame.end === '}' ? 'key' : 'value';
            frame.canCloseEmpty = false;
            index++;
            continue;
        }
        if (frame?.state === 'key') {
            if (char !== '"') return undefined;
            const end = stringEnd(input, index);
            if (end === undefined) return undefined;
            index = end;
            frame.state = 'colon';
            continue;
        }
        if (frame?.state === 'colon') {
            if (char !== ':') return undefined;
            frame.state = 'value'; index++;
            continue;
        }
        if (char === '{' || char === '[') {
            stack.push({ end: char === '{' ? '}' : ']', state: char === '{' ? 'key' : 'value', canCloseEmpty: true });
            index++;
            continue;
        }
        if (!frame) return undefined;
        if (char === '"') {
            const ordinaryEnd = stringEnd(input, index);
            if (ordinaryEnd === undefined) return undefined;
            if (looksLikeOuterEnd(input, ordinaryEnd)) index = ordinaryEnd;
            else {
                const repair = embeddedString(input, index);
                if (!repair) return undefined;
                // A large payload can contain more quote edits than a JS call's
                // argument limit; append iteratively rather than spreading them.
                for (const position of repair.positions) positions.push(position);
                index = repair.end;
            }
        } else {
            numberToken.lastIndex = index;
            const number = numberToken.exec(input)?.[0];
            const literal = number ?? (input.startsWith('true', index) ? 'true' : input.startsWith('false', index) ? 'false' : input.startsWith('null', index) ? 'null' : undefined);
            if (literal === undefined) return undefined;
            index += literal.length;
        }
        finishValue();
    }
    if (!rootFinished || stack.length || !positions.length) return undefined;
    const candidate = insertEscapes(input, positions, 0, input.length);
    return parsesStrictJson(candidate) ? candidate : undefined;
}
