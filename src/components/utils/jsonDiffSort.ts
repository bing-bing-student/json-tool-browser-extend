// JSON 规范排序工具：Diff 模式与右键数组排序共用同一套递归比较规则。
import { normalizeJsonNumberLiteral, tryParseHighPrecisionWrapper, tryReadHighPrecisionWrapperObject } from './jsonEngine/numberLiteral';

export type JsonCanonicalSortOrder = 'asc' | 'desc';

interface DiffSortOptions {
    sortArrays: boolean;
    sortOrder: JsonCanonicalSortOrder;
}

const compareText = (a: string, b: string): number => {
    if (a === b) return 0;
    return a < b ? -1 : 1;
};

const applySortOrder = (result: number, order: DiffSortOptions['sortOrder']): number => {
    return order === 'asc' ? result : -result;
};

const getHighPrecisionNumberLiteral = (value: any): string | null => {
    const literal = typeof value === 'string' ? tryParseHighPrecisionWrapper(value) : tryReadHighPrecisionWrapperObject(value);
    return literal === null ? null : normalizeJsonNumberLiteral(literal);
};

const normalizeIntegerLiteral = (literal: string) => {
    const sign = literal.startsWith('-') ? -1 : 1;
    const digits = literal.replace(/^[+-]?0+(?=\d)/, '').replace(/^[+-]/, '');
    return { sign, digits: digits || '0' };
};

const compareIntegerLiterals = (a: string, b: string): number => {
    const left = normalizeIntegerLiteral(a);
    const right = normalizeIntegerLiteral(b);

    if (left.sign !== right.sign) return left.sign - right.sign;
    if (left.digits.length !== right.digits.length) {
        return left.sign === 1 ? left.digits.length - right.digits.length : right.digits.length - left.digits.length;
    }
    if (left.digits === right.digits) return 0;
    return left.sign === 1 ? (left.digits > right.digits ? 1 : -1) : left.digits > right.digits ? -1 : 1;
};

const compareNumberLiterals = (a: string, b: string): number => {
    if (/^-?\d+$/.test(a) && /^-?\d+$/.test(b)) {
        return compareIntegerLiterals(a, b);
    }

    const left = Number(a);
    const right = Number(b);
    if (Number.isFinite(left) && Number.isFinite(right)) {
        if (left < right) return -1;
        if (left > right) return 1;
        return compareText(a, b);
    }

    return compareText(a, b);
};

const getDiffSortRank = (value: any): 0 | 1 | 2 | 3 | 4 | 5 => {
    if (value === null || value === undefined || typeof value === 'function' || typeof value === 'symbol') {
        return 0;
    }

    if (getHighPrecisionNumberLiteral(value) !== null) return 2;
    if (typeof value === 'boolean') return 1;
    if (typeof value === 'number') return Number.isFinite(value) ? 2 : 0;
    if (typeof value === 'string') return 3;
    if (Array.isArray(value)) return 4;
    if (typeof value === 'object') return 5;

    return 0;
};

const getNumberLiteralForDiffSort = (value: any): string => {
    return getHighPrecisionNumberLiteral(value) ?? (typeof value === 'number' && Number.isFinite(value) ? String(value) : '0');
};

const compareDiffSortValues = (a: any, b: any): number => {
    const rankA = getDiffSortRank(a);
    const rankB = getDiffSortRank(b);
    if (rankA !== rankB) return rankA - rankB;

    switch (rankA) {
        case 0:
            return 0;
        case 1:
            return a === b ? 0 : a ? 1 : -1;
        case 2:
            return compareNumberLiterals(getNumberLiteralForDiffSort(a), getNumberLiteralForDiffSort(b));
        case 3:
            return compareText(String(a), String(b));
        case 4:
            return compareDiffSortArrays(a, b);
        case 5:
            return compareDiffSortObjects(a, b);
        default:
            return 0;
    }
};

const compareDiffSortArrays = (a: any[], b: any[]): number => {
    const maxLength = Math.min(a.length, b.length);
    for (let i = 0; i < maxLength; i++) {
        const result = compareDiffSortValues(a[i], b[i]);
        if (result !== 0) return result;
    }
    return a.length - b.length;
};

const compareDiffSortObjects = (a: Record<string, any>, b: Record<string, any>): number => {
    const keysA = Object.keys(a).sort(compareText);
    const keysB = Object.keys(b).sort(compareText);
    const maxLength = Math.min(keysA.length, keysB.length);

    for (let i = 0; i < maxLength; i++) {
        const keyResult = compareText(keysA[i], keysB[i]);
        if (keyResult !== 0) return keyResult;

        const valueResult = compareDiffSortValues(a[keysA[i]], b[keysB[i]]);
        if (valueResult !== 0) return valueResult;
    }

    return keysA.length - keysB.length;
};

const normalizeNodeForDiffSort = (value: any, options: DiffSortOptions, seen: WeakMap<object, any>): any => {
    if (value === null || value === undefined || typeof value !== 'object') {
        return value;
    }

    if (tryReadHighPrecisionWrapperObject(value) !== null) {
        return value;
    }

    const cached = seen.get(value);
    if (cached) return cached;

    if (Array.isArray(value)) {
        const normalizedItems: any[] = [];
        seen.set(value, normalizedItems);

        for (const item of value) {
            normalizedItems.push(normalizeNodeForDiffSort(item, options, seen));
        }

        if (!options.sortArrays) {
            return normalizedItems;
        }

        const sortedItems = normalizedItems
            .map((item, index) => ({
                item,
                index,
            }))
            .sort((a, b) => {
                const result = compareDiffSortValues(a.item, b.item);
                return result === 0 ? a.index - b.index : applySortOrder(result, options.sortOrder);
            })
            .map(({ item }) => item);
        seen.set(value, sortedItems);
        return sortedItems;
    }

    const result: Record<string, any> = {};
    seen.set(value, result);

    for (const key of Object.keys(value).sort((a, b) => applySortOrder(compareText(a, b), options.sortOrder))) {
        result[key] = normalizeNodeForDiffSort(value[key], options, seen);
    }

    return result;
};

export const sortJsonForDiff = (data: any, options: DiffSortOptions): any => {
    return normalizeNodeForDiffSort(data, options, new WeakMap<object, any>());
};

export const sortJsonArrayByCanonicalKey = (array: any[], sortOrder: JsonCanonicalSortOrder): any[] => {
    return normalizeNodeForDiffSort(array, { sortArrays: true, sortOrder }, new WeakMap<object, any>());
};
