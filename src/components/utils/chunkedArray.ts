const BLOCK_SIZE = 1024;
const CHUNKED = Symbol('json-tool-chunked-array');

/** Dense array storage with cheap local insertions; used only for Monaco's token caches. */
class ChunkedArray<T> {
    private blocks: T[][] = [];
    private offsets: number[] = [];
    private cached = -1;
    private fallback: T;
    length = 0;

    constructor(values: T[], fallback: T) { this.fallback = fallback; this.append(values); }

    private locate(index: number) {
        if (this.cached >= 0 && index >= this.offsets[this.cached] && index < this.offsets[this.cached] + this.blocks[this.cached].length) return this.cached;
        let low = 0, high = this.blocks.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (this.offsets[middle] <= index) low = middle + 1; else high = middle;
        }
        return this.cached = low - 1;
    }

    private append(values: T[]) {
        let start = 0;
        const last = this.blocks[this.blocks.length - 1];
        if (last && last.length < BLOCK_SIZE) {
            const take = Math.min(BLOCK_SIZE - last.length, values.length);
            for (; start < take; start++) last.push(values[start]);
            this.length += take;
        }
        for (; start < values.length; start += BLOCK_SIZE) {
            const block = values.slice(start, start + BLOCK_SIZE);
            this.offsets.push(this.length); this.blocks.push(block); this.length += block.length;
        }
    }

    get(index: number) {
        if (index < 0 || index >= this.length) return undefined;
        const block = this.locate(index);
        return this.blocks[block][index - this.offsets[block]];
    }

    set(index: number, value: T) {
        if (index >= this.length) this.append(Array(index - this.length + 1).fill(this.fallback));
        const block = this.locate(index);
        this.blocks[block][index - this.offsets[block]] = value;
    }

    slice(start = 0, end = this.length) {
        start = start < 0 ? Math.max(0, this.length + start) : Math.min(this.length, start);
        end = end < 0 ? Math.max(0, this.length + end) : Math.min(this.length, end);
        const result: T[] = [];
        for (let i = start; i < end; i++) result.push(this.get(i)!);
        return result;
    }

    splice(start: number, count: number, inserted: T[]) {
        start = start < 0 ? Math.max(0, this.length + start) : Math.min(this.length, start);
        count = Math.max(0, Math.min(count, this.length - start));
        const removed = this.slice(start, start + count);
        if (start === this.length) { this.append(inserted); return removed; }
        if (!count && !inserted.length) return removed;
        const first = this.locate(start), last = this.locate(count ? start + count - 1 : start);
        const merged = this.blocks[first].slice(0, start - this.offsets[first]).concat(inserted, this.blocks[last].slice(start + count - this.offsets[last]));
        const replacements: T[][] = [];
        const size = merged.length ? Math.ceil(merged.length / Math.ceil(merged.length / BLOCK_SIZE)) : BLOCK_SIZE;
        for (let i = 0; i < merged.length; i += size) replacements.push(merged.slice(i, i + size));
        this.blocks.splice(first, last - first + 1, ...replacements);
        let offset = 0;
        this.offsets = this.blocks.map((block) => { const at = offset; offset += block.length; return at; });
        this.length = offset; this.cached = -1;
        return removed;
    }
}

const arrayIndex = (key: PropertyKey) => {
    if (typeof key !== 'string') return -1;
    const value = Number(key);
    return Number.isInteger(value) && value >= 0 && String(value) === key ? value : -1;
};

export const isChunkedArray = (values: unknown) => Boolean((values as any)?.[CHUNKED]);

/** Preserve the indexed-array surface used by Monaco without moving a million cache entries per edit. */
export const createChunkedArray = <T>(values: T[], fallback: T): T[] => {
    const storage = new ChunkedArray(values, fallback);
    return new Proxy([] as T[], {
        get(target, key, receiver) {
            if (key === CHUNKED) return true;
            if (key === 'length') return storage.length;
            if (key === 'slice') return storage.slice.bind(storage);
            if (key === 'splice') return (...args: any[]) => storage.splice(args[0] ?? 0, args.length < 2 ? storage.length : args[1] ?? 0, args.slice(2));
            const index = arrayIndex(key);
            return index >= 0 ? storage.get(index) : Reflect.get(target, key, receiver);
        },
        set(target, key, value, receiver) {
            if (key === 'length') {
                if (value < storage.length) storage.splice(value, storage.length - value, []);
                else if (value > storage.length) storage.set(value - 1, fallback);
                return true;
            }
            const index = arrayIndex(key);
            if (index >= 0) { storage.set(index, value); return true; }
            return Reflect.set(target, key, value, receiver);
        },
        has(target, key) { const index = arrayIndex(key); return index >= 0 ? index < storage.length : Reflect.has(target, key); },
        ownKeys() { return [...Array.from({ length: storage.length }, (_, i) => String(i)), 'length']; },
        getOwnPropertyDescriptor(target, key) {
            if (key === 'length') return { ...Reflect.getOwnPropertyDescriptor(target, key)!, value: storage.length };
            const index = arrayIndex(key);
            if (index >= 0 && index < storage.length) return { configurable: true, enumerable: true, writable: true, value: storage.get(index) };
            return Reflect.getOwnPropertyDescriptor(target, key);
        },
    });
};
