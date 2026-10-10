// 行级 / 行内 diff 算法（纯函数，无 Vue / 无 monaco / 无 DOM 依赖）
//
// - DiffLineChange / InlineDiffSegment / InlineDiffResult：行级与行内片段的结构定义
// - computeLineDiff：基于 histogram-diff 主路径 + LCS 兜底，先线性裁公共前后缀
// - computeInlineDiff：先裁公共前后缀，再对有界窗口做字符级 diff

import { diffChars, type Change as DiffChange } from 'diff';
import { histogramDiff, type Region as HistogramRegion } from 'histogram-diff';

// 与旧 Monaco IDiffEditor.getLineChanges 结构兼容
export interface DiffLineChange {
    originalStartLineNumber: number;
    originalEndLineNumber: number; // < start 表示纯插入（左侧在此处插入空）
    modifiedStartLineNumber: number;
    modifiedEndLineNumber: number; // < start 表示纯删除（右侧在此处插入空）
}

/**
 * 行内差异片段。startCol / endCol 采用 Monaco 的 1-based 列号约定
 * （等同于 UTF-16 code unit 序号 + 1），可以直接构造 monaco.Range。
 */
export interface InlineDiffSegment {
    startCol: number;
    endCol: number;
}

export interface InlineDiffResult {
    leftSegments: InlineDiffSegment[];
    rightSegments: InlineDiffSegment[];
    /** 差异窗口过大、放弃精细化时为 true（此时整段被标为一个大片段） */
    tooLarge: boolean;
}

/** 前后缀裁剪后中间差异窗口超过这个阈值，放弃 diffChars，整段标记 */
const INLINE_DIFF_WINDOW_LIMIT = 20_000;

/**
 * 字符串外沿用连续空白压缩和首尾空白忽略，字符串内保持原文。
 * 跟踪 JSON5 单引号、转义和注释；跨行保留字符串状态，避免改写续行内容。
 * 归一化只用于行级匹配，差异的行号与行内列号仍对应原始文本。
 */
const normalizeLinesForDiff = (lines: string[]): string[] => {
    let quote: '"' | "'" | null = null;
    let inBlockComment = false;

    return lines.map((line) => {
        if (!quote && !inBlockComment && !line.includes('"') && !line.includes("'") && !line.includes('/*')) {
            return line.replace(/\s+/g, ' ').trim();
        }

        let normalized = '';
        let pendingWhitespace = false;
        let inLineComment = false;

        for (let index = 0; index < line.length; index++) {
            if (quote) {
                const start = index;
                while (index < line.length) {
                    const char = line[index++];
                    if (char === '\\' && index < line.length) {
                        index++;
                    } else if (char === quote) {
                        quote = null;
                        break;
                    }
                }
                normalized += line.slice(start, index);
                index--;
                continue;
            }

            const char = line[index];
            if (/\s/.test(char)) {
                pendingWhitespace = normalized.length > 0;
                continue;
            }
            if (pendingWhitespace) {
                normalized += ' ';
                pendingWhitespace = false;
            }
            normalized += char;

            if (inLineComment) continue;
            const next = line[index + 1];
            if (inBlockComment) {
                if (char === '*' && next === '/') {
                    normalized += next;
                    index++;
                    inBlockComment = false;
                }
                continue;
            }

            if (char === '"' || char === "'") {
                quote = char;
            } else if (char === '/' && next === '*') {
                normalized += next;
                index++;
                inBlockComment = true;
            } else if (char === '#' || (char === '/' && next === '/')) {
                inLineComment = true;
            }
        }

        return normalized;
    });
};

const trimHistogramRegion = (leftNorm: string[], rightNorm: string[], region: HistogramRegion): HistogramRegion | null => {
    let [aLo, aHi, bLo, bHi] = region;

    while (aLo < aHi && bLo < bHi && leftNorm[aLo] === rightNorm[bLo]) {
        aLo++;
        bLo++;
    }

    while (aLo < aHi && bLo < bHi && leftNorm[aHi - 1] === rightNorm[bHi - 1]) {
        aHi--;
        bHi--;
    }

    if (aLo === aHi && bLo === bHi) return null;
    return [aLo, aHi, bLo, bHi];
};

const mapHistogramRegionsToLineChanges = (leftNorm: string[], rightNorm: string[], regions: HistogramRegion[], lineOffset: number): DiffLineChange[] => {
    return regions
        .map((region) => trimHistogramRegion(leftNorm, rightNorm, region))
        .filter((region): region is HistogramRegion => region !== null)
        .map(([aLo, aHi, bLo, bHi]) => ({
            originalStartLineNumber: lineOffset + aLo + 1,
            originalEndLineNumber: lineOffset + aHi,
            modifiedStartLineNumber: lineOffset + bLo + 1,
            modifiedEndLineNumber: lineOffset + bHi,
        }));
};

const offsetLineChanges = (changes: DiffLineChange[], lineOffset: number): DiffLineChange[] => {
    if (lineOffset === 0) return changes;
    return changes.map((change) => ({
        originalStartLineNumber: change.originalStartLineNumber + lineOffset,
        originalEndLineNumber: change.originalEndLineNumber + lineOffset,
        modifiedStartLineNumber: change.modifiedStartLineNumber + lineOffset,
        modifiedEndLineNumber: change.modifiedEndLineNumber + lineOffset,
    }));
};

const computeLineDiffWithLcsFallback = (leftNorm: string[], rightNorm: string[]): DiffLineChange[] => {
    const m = leftNorm.length;
    const n = rightNorm.length;
    const dp: number[][] = [];
    for (let i = 0; i <= m; i++) dp.push(new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (leftNorm[i - 1] === rightNorm[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // 回溯得到编辑脚本：sequence of 'eq' | 'del' | 'ins'
    const ops: Array<{ type: 'eq' | 'del' | 'ins'; left?: number; right?: number }> = [];
    let i = m,
        j = n;
    while (i > 0 && j > 0) {
        if (leftNorm[i - 1] === rightNorm[j - 1]) {
            ops.push({ type: 'eq', left: i, right: j });
            i--;
            j--;
        } else if (dp[i - 1][j] >= dp[i][j - 1]) {
            ops.push({ type: 'del', left: i });
            i--;
        } else {
            ops.push({ type: 'ins', right: j });
            j--;
        }
    }
    while (i > 0) {
        ops.push({ type: 'del', left: i-- });
    }
    while (j > 0) {
        ops.push({ type: 'ins', right: j-- });
    }
    ops.reverse();

    // 将连续的 del/ins 合并成一个 change 块，严格按行号升序
    const changes: DiffLineChange[] = [];
    let curOrigStart = -1,
        curOrigEnd = -1,
        curModStart = -1,
        curModEnd = -1;
    let lastLeft = 0,
        lastRight = 0;
    const flush = () => {
        if (curOrigStart === -1 && curModStart === -1) return;
        const origS = curOrigStart === -1 ? lastLeft : curOrigStart;
        const origE = curOrigEnd === -1 ? origS - 1 : curOrigEnd;
        const modS = curModStart === -1 ? lastRight : curModStart;
        const modE = curModEnd === -1 ? modS - 1 : curModEnd;
        changes.push({
            originalStartLineNumber: origS,
            originalEndLineNumber: origE,
            modifiedStartLineNumber: modS,
            modifiedEndLineNumber: modE,
        });
        curOrigStart = curOrigEnd = curModStart = curModEnd = -1;
    };

    for (const op of ops) {
        if (op.type === 'eq') {
            flush();
            lastLeft = op.left!;
            lastRight = op.right!;
        } else if (op.type === 'del') {
            if (curOrigStart === -1) {
                curOrigStart = op.left!;
                if (curModStart === -1) curModStart = lastRight + 1;
            }
            curOrigEnd = op.left!;
        } else {
            if (curModStart === -1) {
                curModStart = op.right!;
                if (curOrigStart === -1) curOrigStart = lastLeft + 1;
            }
            curModEnd = op.right!;
        }
    }
    flush();
    return changes;
};

/**
 * 计算两组字符串数组之间的行级差异，返回与 Monaco IDiffEditor.getLineChanges()
 * 结构兼容的 DiffLineChange 数组。
 *
 * 主路径使用 histogram diff（更适合重复行较多的大 JSON / 数组场景），
 * 并先线性裁掉公共前后缀以避免超大相同文件误报成整段 diff。
 */
export const computeLineDiff = (leftLines: string[], rightLines: string[], options: { exact?: boolean } = {}): DiffLineChange[] => {
    const m = leftLines.length;
    const n = rightLines.length;

    const leftNorm = options.exact ? leftLines : normalizeLinesForDiff(leftLines);
    const rightNorm = options.exact ? rightLines : normalizeLinesForDiff(rightLines);

    if (m === 0 && n === 0) return [];

    let prefixLen = 0;
    const minLen = Math.min(m, n);
    while (prefixLen < minLen && leftNorm[prefixLen] === rightNorm[prefixLen]) {
        prefixLen++;
    }

    if (prefixLen === m && prefixLen === n) return [];

    let leftTrimEnd = m;
    let rightTrimEnd = n;
    while (leftTrimEnd > prefixLen && rightTrimEnd > prefixLen && leftNorm[leftTrimEnd - 1] === rightNorm[rightTrimEnd - 1]) {
        leftTrimEnd--;
        rightTrimEnd--;
    }

    const leftWindow = leftNorm.slice(prefixLen, leftTrimEnd);
    const rightWindow = rightNorm.slice(prefixLen, rightTrimEnd);
    if (leftWindow.length === 0 && rightWindow.length === 0) return [];

    try {
        return mapHistogramRegionsToLineChanges(leftWindow, rightWindow, histogramDiff(leftWindow, rightWindow), prefixLen);
    } catch {
        return offsetLineChanges(computeLineDiffWithLcsFallback(leftWindow, rightWindow), prefixLen);
    }
};

/**
 * 修复可能在修改内容的同时添加数组外壳等新行。将不等长差异块里可以可靠
 * 对应的行拆出来，避免把新增的 `[` 和修改后的日志强配对或跳过字符高亮。
 * 只在附近寻找有足够公共前后缀的行；无法确认时保留原来的整块差异。
 */
export const refineRepairLineChanges = (left: string[], right: string[], changes: DiffLineChange[]): DiffLineChange[] => {
    const result: DiffLineChange[] = [];
    let remainingComparisons = 10_000;
    const similarity = (a: string, b: string): number => {
        if (--remainingComparisons < 0) return 0;
        a = a.trim(); b = b.trim();
        if (!a.length || !b.length) return 0;
        const minLength = Math.min(a.length, b.length);
        let prefix = 0, suffix = 0;
        while (prefix < minLength && a.charCodeAt(prefix) === b.charCodeAt(prefix)) prefix++;
        while (suffix < minLength - prefix && a.charCodeAt(a.length - suffix - 1) === b.charCodeAt(b.length - suffix - 1)) suffix++;
        const common = prefix + suffix;
        return common >= Math.min(4, minLength) ? common / Math.max(a.length, b.length) : 0;
    };
    const append = (aStart: number, aEnd: number, bStart: number, bEnd: number) => {
        if (aStart === aEnd && bStart === bEnd) return;
        const previous = result[result.length - 1];
        // Keep adjacent paired replacements in one block; inserted/deleted lines stay separate.
        if (aEnd - aStart > 0 && aEnd - aStart === bEnd - bStart && previous &&
            previous.originalEndLineNumber - previous.originalStartLineNumber === previous.modifiedEndLineNumber - previous.modifiedStartLineNumber &&
            previous.originalEndLineNumber >= previous.originalStartLineNumber &&
            previous.originalEndLineNumber === aStart && previous.modifiedEndLineNumber === bStart) {
            previous.originalEndLineNumber = aEnd; previous.modifiedEndLineNumber = bEnd;
        } else {
            result.push({ originalStartLineNumber: aStart + 1, originalEndLineNumber: aEnd,
                modifiedStartLineNumber: bStart + 1, modifiedEndLineNumber: bEnd });
        }
    };
    for (const change of changes) {
        let a = change.originalStartLineNumber - 1, b = change.modifiedStartLineNumber - 1;
        const aEnd = change.originalEndLineNumber, bEnd = change.modifiedEndLineNumber;
        while (a < aEnd && b < bEnd && aEnd - a !== bEnd - b) {
            let bestScore = similarity(left[a], right[b]), skipLeft = 0, skipRight = 0;
            // Only skip on the longer side, and bound the work on large corrupted documents.
            const extraLeft = Math.max(0, (aEnd - a) - (bEnd - b));
            const extraRight = Math.max(0, (bEnd - b) - (aEnd - a));
            for (let offset = 1; offset <= Math.min(8, Math.max(extraLeft, extraRight)) && bestScore < 0.98 && remainingComparisons > 0; offset++) {
                const score = extraLeft ? similarity(left[a + offset], right[b]) : similarity(left[a], right[b + offset]);
                if (score > bestScore) { bestScore = score; skipLeft = extraLeft ? offset : 0; skipRight = extraRight ? offset : 0; }
            }
            if (bestScore < 0.6) break;
            append(a, a + skipLeft, b, b + skipRight);
            a += skipLeft; b += skipRight;
            if (left[a] !== right[b]) append(a, a + 1, b, b + 1);
            a++; b++;
        }
        append(a, aEnd, b, bEnd);
    }
    return result;
};

/**
 * 计算两行字符串的行内字符级差异，返回可直接用于 Monaco inlineClassName
 * 装饰的列号片段。内部做了前后缀公共串裁剪 + 差异窗口兜底，
 * 能安全处理 ~1MB 长字符串的常见 case（差异集中在一小段）。
 */
export const computeInlineDiff = (left: string, right: string): InlineDiffResult | null => {
    if (left === right) return null;
    const splitsSurrogate = (text: string, index: number) =>
        index > 0 && index < text.length && text.charCodeAt(index - 1) >= 0xD800 && text.charCodeAt(index - 1) <= 0xDBFF &&
        text.charCodeAt(index) >= 0xDC00 && text.charCodeAt(index) <= 0xDFFF;

    // 1. 最长公共前缀
    const minLen = Math.min(left.length, right.length);
    let prefixLen = 0;
    while (prefixLen < minLen && left.charCodeAt(prefixLen) === right.charCodeAt(prefixLen)) {
        prefixLen++;
    }
    // Monaco columns count UTF-16 units, but the changed window must retain complete code points.
    if (splitsSurrogate(left, prefixLen) || splitsSurrogate(right, prefixLen)) prefixLen--;
    // 2. 最长公共后缀（不能和前缀重叠）
    let suffixLen = 0;
    const maxSuffix = minLen - prefixLen;
    while (suffixLen < maxSuffix && left.charCodeAt(left.length - 1 - suffixLen) === right.charCodeAt(right.length - 1 - suffixLen)) {
        suffixLen++;
    }
    if (splitsSurrogate(left, left.length - suffixLen) || splitsSurrogate(right, right.length - suffixLen)) suffixLen--;

    const leftMidLen = left.length - prefixLen - suffixLen;
    const rightMidLen = right.length - prefixLen - suffixLen;

    // 裁剪后完全一致（理论上不该走到，留作防御）
    if (leftMidLen === 0 && rightMidLen === 0) return null;

    // 差异窗口过大，直接整段标记，不再跑 diffChars
    if (leftMidLen + rightMidLen > INLINE_DIFF_WINDOW_LIMIT) {
        return {
            leftSegments: leftMidLen > 0 ? [{ startCol: prefixLen + 1, endCol: prefixLen + leftMidLen + 1 }] : [],
            rightSegments: rightMidLen > 0 ? [{ startCol: prefixLen + 1, endCol: prefixLen + rightMidLen + 1 }] : [],
            tooLarge: true,
        };
    }

    const leftMid = left.slice(prefixLen, left.length - suffixLen);
    const rightMid = right.slice(prefixLen, right.length - suffixLen);

    let changes: DiffChange[] | undefined;
    try {
        changes = diffChars(leftMid, rightMid, { timeout: 50, maxEditLength: 2000 });
        if (!changes) throw new Error('Inline diff exceeded its work budget');
    } catch {
        // jsdiff 在极端输入下可能抛错，安全降级
        return {
            leftSegments: leftMidLen > 0 ? [{ startCol: prefixLen + 1, endCol: prefixLen + leftMidLen + 1 }] : [],
            rightSegments: rightMidLen > 0 ? [{ startCol: prefixLen + 1, endCol: prefixLen + rightMidLen + 1 }] : [],
            tooLarge: true,
        };
    }

    const leftSegments: InlineDiffSegment[] = [];
    const rightSegments: InlineDiffSegment[] = [];
    let leftPos = prefixLen;
    let rightPos = prefixLen;

    for (const change of changes) {
        const len = change.value.length;
        if (change.added) {
            if (len > 0) {
                rightSegments.push({
                    startCol: rightPos + 1,
                    endCol: rightPos + len + 1,
                });
            }
            rightPos += len;
        } else if (change.removed) {
            if (len > 0) {
                leftSegments.push({
                    startCol: leftPos + 1,
                    endCol: leftPos + len + 1,
                });
            }
            leftPos += len;
        } else {
            leftPos += len;
            rightPos += len;
        }
    }

    return { leftSegments, rightSegments, tooLarge: false };
};

/**
 * 给定一个 DiffLineChange，返回左右是否有内容、各自行数。
 * （endLineNumber < startLineNumber 表示该侧为空，对应"纯插入"或"纯删除"）
 */
export const getDiffLineRangeInfo = (change: DiffLineChange) => {
    const hasLeft = change.originalEndLineNumber >= change.originalStartLineNumber;
    const hasRight = change.modifiedEndLineNumber >= change.modifiedStartLineNumber;
    const leftLineCount = hasLeft ? change.originalEndLineNumber - change.originalStartLineNumber + 1 : 0;
    const rightLineCount = hasRight ? change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1 : 0;
    return { hasLeft, hasRight, leftLineCount, rightLineCount };
};
