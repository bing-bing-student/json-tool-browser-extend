// JSON 结构分析与转义检查（纯函数）

// 计算 JSON 对象的最大深度或最大层级
export const calculateJsonStructure = (obj: any, mode: 'depth' | 'level' = 'depth', currentValue: number = mode === 'depth' ? 0 : 1): number => {
    if (typeof obj !== 'object' || obj === null) {
        return mode === 'depth' ? currentValue : currentValue - 1;
    }

    // 空对象或空数组处理
    if (Object.keys(obj).length === 0) {
        return currentValue;
    }

    // 深度超过限制直接返回（仅适用于depth模式）
    if (mode === 'depth' && currentValue > 99) {
        return 100;
    }

    // 递归计算最大深度/层级
    let maxValue = currentValue;

    if (Array.isArray(obj)) {
        for (const item of obj) {
            const childValue = calculateJsonStructure(item, mode, currentValue + 1);
            maxValue = Math.max(maxValue, childValue);
            if (mode === 'depth' && maxValue > 99) return 100;
        }
    } else {
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const childValue = calculateJsonStructure(obj[key], mode, currentValue + 1);
                maxValue = Math.max(maxValue, childValue);
                if (mode === 'depth' && maxValue > 99) return 100;
            }
        }
    }

    return maxValue;
};

// 计算 JSON 的最大层级
export const calculateMaxLevel = (obj: any, currentLevel: number = 1): number => {
    return calculateJsonStructure(obj, 'level', currentLevel);
};

// 检查 JSON 字符串中是否存在非法转义序列
export const detectIllegalEscapes = (str: string): { hasIllegal: boolean; details: string[] } => {
    const details: string[] = [];

    // 使用正则表达式查找所有转义序列
    const escapeRegex = /\\./g;
    let match;

    while ((match = escapeRegex.exec(str)) !== null) {
        const escapeSeq = match[0];
        const char = escapeSeq[1];

        // 检查非法 Unicode 转义
        if (char === 'u') {
            const remaining = str.substr(match.index + 2, 4);
            if (remaining.length < 4 || !/^[0-9a-fA-F]{4}$/.test(remaining)) {
                details.push(`非法Unicode转义: ${escapeSeq}${remaining.substring(0, 4)}`);
            }
        }
        // 检查非法十六进制转义
        else if (char === 'x') {
            const remaining = str.substr(match.index + 2, 2);
            if (remaining.length < 2 || !/^[0-9a-fA-F]{2}$/.test(remaining)) {
                details.push(`非法十六进制转义: ${escapeSeq}${remaining.substring(0, 2)}`);
            }
        }
        // 检查其他非法转义序列
        else if (!['"', '\\', '/', 'b', 'f', 'n', 'r', 't'].includes(char)) {
            details.push(`非法转义序列: ${escapeSeq}`);
        }
    }

    return { hasIllegal: details.length > 0, details };
};

// 检测转义符号数量是否「层级不自洽」（仅检测，不修改任何解析逻辑）。
// 原理：对被统一转义了 k 层的 JSON，结构引号前的反斜杠数为 2^k-1，
// 而嵌入 JSON 源文本里的反斜杠会被同层转义成 2^k 的整数倍。
// 例如结构引号是 \" 时，\u 是 \\u，字面量 \u 是 \\\\u，二者都自洽。
// 若某个 \u / \x 前的反斜杠数不是该层级的整数倍，则视为不自洽（如引号转义了 2 层但 \u 只转义了 1 层）。
// 仅在同一个字符串片段看起来像「被转义的 JSON 对象/数组」时才判定，
// 避免把不同 JSON 字段里的转义符号混在一起，或把普通字符串里的 \" 误当结构引号。
const looksLikeEscapedJsonStructure = (str: string): boolean => {
    const trimmed = str.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
    return /\\"\s*:/.test(str);
};

const isEscapeRunConsistentWithQuoteRun = (escapeRun: number, quoteRun: number): boolean => {
    const unitRun = quoteRun + 1;
    return unitRun > 0 && escapeRun >= unitRun && escapeRun % unitRun === 0;
};

const detectInconsistentEscapeLevelsInSegment = (str: string): boolean => {
    if (!looksLikeEscapedJsonStructure(str)) {
        return false;
    }

    const escapedQuoteRuns: Array<{ index: number; run: number }> = [];
    const unicodeRuns: Array<{ index: number; run: number }> = [];

    let i = 0;
    while (i < str.length) {
        if (str[i] === '\\') {
            const index = i;
            let run = 0;
            while (i < str.length && str[i] === '\\') {
                run++;
                i++;
            }
            const next = str[i] || '';
            if (next === '"') {
                // 奇数个反斜杠 + 引号 => 这是一个被转义的结构引号
                if (run % 2 === 1) escapedQuoteRuns.push({ index, run });
                i++;
            } else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(str.substr(i + 1, 4))) {
                unicodeRuns.push({ index, run });
                i++;
            } else if (next === 'x' && /^[0-9a-fA-F]{2}$/.test(str.substr(i + 1, 2))) {
                unicodeRuns.push({ index, run });
                i++;
            }
        } else {
            i++;
        }
    }

    if (escapedQuoteRuns.length === 0 || unicodeRuns.length === 0) {
        return false;
    }

    return unicodeRuns.some((unicodeRun) => {
        let previousQuoteRun: { index: number; run: number } | undefined;
        for (const quoteRun of escapedQuoteRuns) {
            if (quoteRun.index < unicodeRun.index) {
                previousQuoteRun = quoteRun;
            } else {
                break;
            }
        }
        if (!previousQuoteRun) return false;
        return !isEscapeRunConsistentWithQuoteRun(unicodeRun.run, previousQuoteRun.run);
    });
};

const collectJsonStringSegments = (str: string): string[] => {
    const segments: string[] = [];
    let inString = false;
    let current = '';

    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (ch !== '"') {
            if (inString) current += ch;
            continue;
        }

        let backslashCount = 0;
        for (let j = i - 1; j >= 0 && str[j] === '\\'; j--) {
            backslashCount++;
        }
        const isEscapedQuote = backslashCount % 2 === 1;

        if (inString) {
            if (isEscapedQuote) {
                current += ch;
            } else {
                segments.push(current);
                current = '';
                inString = false;
            }
            continue;
        }

        if (!isEscapedQuote) {
            inString = true;
            current = '';
        }
    }

    return segments;
};

export const detectInconsistentEscapeLevels = (str: string): boolean => {
    const segments = collectJsonStringSegments(str);
    if (segments.length > 0) {
        return segments.some(detectInconsistentEscapeLevelsInSegment);
    }
    return detectInconsistentEscapeLevelsInSegment(str);
};
