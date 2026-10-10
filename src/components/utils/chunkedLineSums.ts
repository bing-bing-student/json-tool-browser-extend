interface Chunk {
    values: number[];
    prefix: number[];
    valid: number;
    total: number;
}

const CHUNK_SIZE = 1024;
const makeChunk = (values: number[]): Chunk => ({ values, prefix: [], valid: -1, total: values.reduce((sum, value) => sum + value, 0) });
const partition = (values: number[]) => {
    const chunks: Chunk[] = [];
    const size = Math.ceil(values.length / Math.ceil(values.length / CHUNK_SIZE));
    for (let start = 0; start < values.length; start += size) chunks.push(makeChunk(values.slice(start, start + size)));
    return chunks;
};

/** Mutable model-to-view line counts. Edits rebuild one small block, not the entire document suffix. */
export class ChunkedLineSums {
    private chunks: Chunk[];
    private offsets: number[] = [];
    private sums: number[] = [];
    private dirtySum = 0;
    private cachedChunk = -1;
    private length = 0;

    constructor(values: number[]) {
        this.chunks = [];
        for (let i = 0; i < values.length; i += CHUNK_SIZE) this.chunks.push(makeChunk(values.slice(i, i + CHUNK_SIZE)));
        this.rebuildOffsets();
    }

    private rebuildOffsets() {
        let offset = 0;
        this.offsets = this.chunks.map((chunk) => { const start = offset; offset += chunk.values.length; return start; });
        this.length = offset;
        this.cachedChunk = -1;
        this.dirtySum = 0;
    }

    private ensureSums() {
        for (let i = this.dirtySum; i < this.chunks.length; i++) this.sums[i] = (i ? this.sums[i - 1] : 0) + this.chunks[i].total;
        this.sums.length = this.chunks.length;
        this.dirtySum = this.chunks.length;
    }

    private findChunk(index: number) {
        const cached = this.cachedChunk;
        if (cached >= 0 && index >= this.offsets[cached] && index < this.offsets[cached] + this.chunks[cached].values.length) return cached;
        let low = 0, high = this.chunks.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (this.offsets[middle] <= index) low = middle + 1;
            else high = middle;
        }
        return this.cachedChunk = low - 1;
    }

    private ensurePrefix(chunk: Chunk) {
        for (let i = chunk.valid + 1; i < chunk.values.length; i++) chunk.prefix[i] = (i ? chunk.prefix[i - 1] : 0) + chunk.values[i];
        chunk.prefix.length = chunk.values.length;
        chunk.valid = chunk.values.length - 1;
    }

    getTotalSum() {
        this.ensureSums();
        return this.sums.length ? this.sums[this.sums.length - 1] : 0;
    }

    getPrefixSum(count: number): number {
        if (count === 0) return 0;
        if (count < 0 || count > this.length) return undefined as unknown as number;
        this.ensureSums();
        const i = this.findChunk(count - 1);
        const chunk = this.chunks[i];
        this.ensurePrefix(chunk);
        return (i ? this.sums[i - 1] : 0) + chunk.prefix[count - 1 - this.offsets[i]];
    }

    getIndexOf(sum: number): { index: number; remainder: number } {
        this.ensureSums();
        if (sum < 0 || sum >= this.getTotalSum()) return { index: undefined as unknown as number, remainder: NaN };
        let low = 0, high = this.chunks.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (this.sums[middle] <= sum) low = middle + 1;
            else high = middle;
        }
        const chunkIndex = low;
        const chunk = this.chunks[chunkIndex];
        this.ensurePrefix(chunk);
        const localSum = sum - (chunkIndex ? this.sums[chunkIndex - 1] : 0);
        low = 0; high = chunk.values.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (chunk.prefix[middle] <= localSum) low = middle + 1;
            else high = middle;
        }
        return { index: this.offsets[chunkIndex] + low, remainder: localSum - (low ? chunk.prefix[low - 1] : 0) };
    }

    setValue(index: number, value: number) {
        const i = this.findChunk(index);
        const chunk = this.chunks[i];
        const local = index - this.offsets[i];
        const previous = chunk.values[local];
        if (previous === value) return;
        chunk.values[local] = value;
        chunk.total += value - previous;
        chunk.valid = Math.min(chunk.valid, local - 1);
        this.dirtySum = Math.min(this.dirtySum, i);
    }

    insertValues(index: number, values: number[]) {
        if (!values.length) return;
        const i = this.chunks.length ? this.findChunk(Math.min(index, this.length - 1)) : 0;
        const chunk = this.chunks[i];
        const local = chunk ? index - this.offsets[i] : 0;
        const merged = chunk ? chunk.values.slice(0, local).concat(values, chunk.values.slice(local)) : values;
        this.chunks.splice(i, chunk ? 1 : 0, ...partition(merged));
        this.rebuildOffsets();
    }

    removeValues(start: number, count: number) {
        let remaining = Math.min(count, this.length - start);
        while (remaining > 0) {
            const i = this.findChunk(start);
            const chunk = this.chunks[i];
            const local = start - this.offsets[i];
            const removed = Math.min(remaining, chunk.values.length - local);
            chunk.values.splice(local, removed);
            if (!chunk.values.length) this.chunks.splice(i, 1);
            else this.chunks[i] = makeChunk(chunk.values);
            remaining -= removed;
            this.rebuildOffsets();
        }
    }
}
