export type JsonFoldingContainerType = 'object' | 'array';

export interface JsonFoldingSummary {
    type: JsonFoldingContainerType;
    count: number;
}

export interface JsonFoldingRange {
    endLine: number;
    type: JsonFoldingContainerType;
}

export interface JsonFoldingInfoBuildResult {
    info: Map<number, JsonFoldingSummary>;
    ranges: Map<number, JsonFoldingRange>;
}

export const JSON_FOLDING_OBJECT_TYPE = 1;
export const JSON_FOLDING_ARRAY_TYPE = 2;

export type JsonFoldingContainerTypeCode = typeof JSON_FOLDING_OBJECT_TYPE | typeof JSON_FOLDING_ARRAY_TYPE;

export interface JsonFoldingSummaryIndex {
    startLines: Uint32Array;
    counts: Uint32Array;
    types: Uint8Array;
}

interface FoldingScanItem {
    startLine: number;
    type: JsonFoldingContainerType;
    count: number;
    arrayItemStarted: boolean;
}

interface FoldingIndexScanItem extends FoldingScanItem {
    index: number;
    typeCode: JsonFoldingContainerTypeCode;
}

export const createEmptyJsonFoldingSummaryIndex = (): JsonFoldingSummaryIndex => ({
    startLines: new Uint32Array(0),
    counts: new Uint32Array(0),
    types: new Uint8Array(0),
});

const CHAR_CODE_LINE_FEED = 10;
const CHAR_CODE_CARRIAGE_RETURN = 13;
const CHAR_CODE_SPACE = 32;
const CHAR_CODE_QUOTE = 34;
const CHAR_CODE_COMMA = 44;
const CHAR_CODE_COLON = 58;
const CHAR_CODE_LEFT_BRACKET = 91;
const CHAR_CODE_BACKSLASH = 92;
const CHAR_CODE_RIGHT_BRACKET = 93;
const CHAR_CODE_TAB = 9;
const CHAR_CODE_LEFT_BRACE = 123;
const CHAR_CODE_RIGHT_BRACE = 125;

const isJsonWhitespaceCode = (charCode: number) =>
    charCode === CHAR_CODE_SPACE || charCode === CHAR_CODE_TAB || charCode === CHAR_CODE_CARRIAGE_RETURN || charCode === CHAR_CODE_LINE_FEED;

export const buildJsonFoldingInfo = (formattedText: string): JsonFoldingInfoBuildResult => {
    const info = new Map<number, JsonFoldingSummary>();
    const ranges = new Map<number, JsonFoldingRange>();

    if (!formattedText) {
        return { info, ranges };
    }

    const stack: FoldingScanItem[] = [];
    let currentLine = 1;
    let inString = false;
    let escapeNext = false;

    const markArrayItemStart = () => {
        const parent = stack[stack.length - 1];
        if (parent?.type === 'array' && !parent.arrayItemStarted) {
            parent.count += 1;
            parent.arrayItemStarted = true;
        }
    };

    for (let i = 0; i < formattedText.length; i++) {
        const charCode = formattedText.charCodeAt(i);

        if (charCode === CHAR_CODE_LINE_FEED) {
            currentLine++;
            continue;
        }

        if (inString) {
            if (escapeNext) {
                escapeNext = false;
                continue;
            }

            if (charCode === CHAR_CODE_BACKSLASH) {
                escapeNext = true;
                continue;
            }

            if (charCode === CHAR_CODE_QUOTE) {
                inString = false;
            }
            continue;
        }

        if (charCode === CHAR_CODE_QUOTE) {
            markArrayItemStart();
            inString = true;
            continue;
        }

        if (charCode === CHAR_CODE_LEFT_BRACE || charCode === CHAR_CODE_LEFT_BRACKET) {
            markArrayItemStart();
            stack.push({
                startLine: currentLine,
                type: charCode === CHAR_CODE_LEFT_BRACE ? 'object' : 'array',
                count: 0,
                arrayItemStarted: false,
            });
            continue;
        }

        if (charCode === CHAR_CODE_RIGHT_BRACE || charCode === CHAR_CODE_RIGHT_BRACKET) {
            const lastItem = stack[stack.length - 1];
            const expectedType = charCode === CHAR_CODE_RIGHT_BRACE ? 'object' : 'array';

            if (lastItem?.type === expectedType) {
                stack.pop();
                ranges.set(lastItem.startLine, { endLine: currentLine, type: lastItem.type });

                if (lastItem.count > 0) {
                    info.set(lastItem.startLine, {
                        type: lastItem.type,
                        count: lastItem.count,
                    });
                }
            }
            continue;
        }

        const currentItem = stack[stack.length - 1];
        if (charCode === CHAR_CODE_COLON && currentItem?.type === 'object') {
            currentItem.count += 1;
            continue;
        }

        if (charCode === CHAR_CODE_COMMA && currentItem?.type === 'array') {
            currentItem.arrayItemStarted = false;
            continue;
        }

        if (!isJsonWhitespaceCode(charCode)) {
            markArrayItemStart();
        }
    }

    return { info, ranges };
};

export const buildJsonFoldingSummaryIndex = (formattedText: string): JsonFoldingSummaryIndex => {
    if (!formattedText) {
        return createEmptyJsonFoldingSummaryIndex();
    }

    const startLines: number[] = [];
    const counts: number[] = [];
    const types: number[] = [];
    const stack: FoldingIndexScanItem[] = [];
    let currentLine = 1;
    let inString = false;
    let escapeNext = false;

    const markArrayItemStart = () => {
        const parent = stack[stack.length - 1];
        if (parent?.type === 'array' && !parent.arrayItemStarted) {
            parent.count += 1;
            parent.arrayItemStarted = true;
        }
    };

    for (let i = 0; i < formattedText.length; i++) {
        const charCode = formattedText.charCodeAt(i);

        if (charCode === CHAR_CODE_LINE_FEED) {
            currentLine++;
            continue;
        }

        if (inString) {
            if (escapeNext) {
                escapeNext = false;
                continue;
            }

            if (charCode === CHAR_CODE_BACKSLASH) {
                escapeNext = true;
                continue;
            }

            if (charCode === CHAR_CODE_QUOTE) {
                inString = false;
            }
            continue;
        }

        if (charCode === CHAR_CODE_QUOTE) {
            markArrayItemStart();
            inString = true;
            continue;
        }

        if (charCode === CHAR_CODE_LEFT_BRACE || charCode === CHAR_CODE_LEFT_BRACKET) {
            markArrayItemStart();
            const type = charCode === CHAR_CODE_LEFT_BRACE ? 'object' : 'array';
            const typeCode = charCode === CHAR_CODE_LEFT_BRACE ? JSON_FOLDING_OBJECT_TYPE : JSON_FOLDING_ARRAY_TYPE;
            const index = startLines.length;
            startLines.push(currentLine);
            counts.push(0);
            types.push(typeCode);
            stack.push({
                startLine: currentLine,
                type,
                typeCode,
                count: 0,
                arrayItemStarted: false,
                index,
            });
            continue;
        }

        if (charCode === CHAR_CODE_RIGHT_BRACE || charCode === CHAR_CODE_RIGHT_BRACKET) {
            const lastItem = stack[stack.length - 1];
            const expectedType = charCode === CHAR_CODE_RIGHT_BRACE ? 'object' : 'array';

            if (lastItem?.type === expectedType) {
                stack.pop();
                counts[lastItem.index] = lastItem.count;
            }
            continue;
        }

        const currentItem = stack[stack.length - 1];
        if (charCode === CHAR_CODE_COLON && currentItem?.type === 'object') {
            currentItem.count += 1;
            continue;
        }

        if (charCode === CHAR_CODE_COMMA && currentItem?.type === 'array') {
            currentItem.arrayItemStarted = false;
            continue;
        }

        if (!isJsonWhitespaceCode(charCode)) {
            markArrayItemStart();
        }
    }

    let summaryCount = 0;
    for (let i = 0; i < counts.length; i++) {
        if (counts[i] > 0) summaryCount++;
    }

    if (summaryCount === 0) {
        return createEmptyJsonFoldingSummaryIndex();
    }

    const summaryStartLines = new Uint32Array(summaryCount);
    const summaryCounts = new Uint32Array(summaryCount);
    const summaryTypes = new Uint8Array(summaryCount);
    let summaryIndex = 0;

    for (let i = 0; i < counts.length; i++) {
        if (counts[i] <= 0) continue;
        summaryStartLines[summaryIndex] = startLines[i];
        summaryCounts[summaryIndex] = counts[i];
        summaryTypes[summaryIndex] = types[i];
        summaryIndex++;
    }

    return {
        startLines: summaryStartLines,
        counts: summaryCounts,
        types: summaryTypes,
    };
};

export const findJsonFoldingSummaryIndex = (index: JsonFoldingSummaryIndex, startLine: number): number => {
    const { startLines } = index;
    let low = 0;
    let high = startLines.length - 1;

    while (low <= high) {
        const middle = (low + high) >>> 1;
        const value = startLines[middle];
        if (value === startLine) return middle;
        if (value < startLine) {
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }

    return -1;
};

export const findJsonFoldingSummaryIndexAtOrBefore = (index: JsonFoldingSummaryIndex, lineNumber: number, maxLookBehind: number = 0): number => {
    const { startLines } = index;
    let low = 0;
    let high = startLines.length - 1;
    let candidate = -1;

    while (low <= high) {
        const middle = (low + high) >>> 1;
        const value = startLines[middle];
        if (value <= lineNumber) {
            candidate = middle;
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }

    if (candidate < 0) {
        return -1;
    }

    return lineNumber - startLines[candidate] <= maxLookBehind ? candidate : -1;
};

export const getJsonFoldingSummaryByIndex = (index: JsonFoldingSummaryIndex, itemIndex: number): JsonFoldingSummary | null => {
    if (itemIndex < 0 || itemIndex >= index.startLines.length) {
        return null;
    }

    const count = index.counts[itemIndex];
    if (count <= 0) {
        return null;
    }

    const typeCode = index.types[itemIndex];
    if (typeCode !== JSON_FOLDING_OBJECT_TYPE && typeCode !== JSON_FOLDING_ARRAY_TYPE) {
        return null;
    }

    return {
        type: typeCode === JSON_FOLDING_OBJECT_TYPE ? 'object' : 'array',
        count,
    };
};
