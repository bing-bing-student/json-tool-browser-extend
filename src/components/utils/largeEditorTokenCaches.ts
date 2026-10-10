import { createChunkedArray, isChunkedArray } from './chunkedArray';

const MAX_LOCAL_INSERT = 8192;

/** Adapt Monaco 0.52's dense token caches without changing their default values or edit semantics. */
export const optimizeLargeEditorTokenCaches = (grammar: any, adapted: WeakSet<object>) => {
    const tokens = grammar?._tokens;
    const supportsTokens = tokens && Array.isArray(tokens._lineTokens) && typeof tokens._len === 'number'
        && typeof tokens._insertLines === 'function' && typeof tokens._ensureLine === 'function';
    // flush() and a large native insertion can replace the backing array on an already adapted store.
    if (supportsTokens && !isChunkedArray(tokens._lineTokens)) {
        tokens._lineTokens = createChunkedArray(tokens._lineTokens, null);
    }
    if (supportsTokens && !adapted.has(tokens)) {
        adapted.add(tokens);
        const insertLines = tokens._insertLines;
        const ensureLine = tokens._ensureLine;
        tokens._insertLines = function (at: number, count: number) {
            if (count > MAX_LOCAL_INSERT) return insertLines.call(this, at, count);
            this._lineTokens.splice(at, 0, ...Array(count).fill(null));
            this._len += count;
        };
        tokens._ensureLine = function (lineIndex: number) {
            if (!isChunkedArray(this._lineTokens) || !Number.isInteger(lineIndex) || lineIndex < 0
                || this._lineTokens.length !== this._len) return ensureLine.call(this, lineIndex);
            if (lineIndex >= this._len) {
                // Monaco normally fills this gap one index at a time. A far-away visible line can
                // otherwise perform a million Proxy writes after a large array has been folded.
                this._lineTokens.length = lineIndex + 1;
                this._len = lineIndex + 1;
            }
        };
    }

    const states = grammar?._tokenizer?.store?._tokenizationStateStore?._lineEndStates;
    const supportsStates = states && Array.isArray(states._store) && '_default' in states
        && typeof states.replace === 'function' && typeof states.insert === 'function' && typeof states.set === 'function';
    if (supportsStates && !isChunkedArray(states._store)) {
        states._store = createChunkedArray(states._store, states._default);
    }
    if (!supportsStates || adapted.has(states)) return;
    adapted.add(states);
    const replace = states.replace;
    const insert = states.insert;
    const set = states.set;
    states.replace = function (at: number, removed: number, added: number) {
        if (added > MAX_LOCAL_INSERT) return replace.call(this, at, removed, added);
        if (at < this._store.length) this._store.splice(at, removed, ...Array(added).fill(this._default));
    };
    states.insert = function (at: number, count: number) {
        if (count > MAX_LOCAL_INSERT) return insert.call(this, at, count);
        if (at < this._store.length) this._store.splice(at, 0, ...Array(count).fill(this._default));
    };
    states.set = function (index: number, value: unknown) {
        if (!isChunkedArray(this._store) || !Number.isInteger(index) || index < 0) return set.call(this, index, value);
        // ChunkedArray.set fills a gap with _default in bulk, including the target before writing it.
        this._store[index] = value;
    };
};
