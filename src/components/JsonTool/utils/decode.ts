// ========================================
// 智能解码函数：自动识别并解码各种编码格式
// ========================================

const isUnsafeUnicodeDecodeTarget = (code: number): boolean => code <= 0x1f || code === 0x7f || (code >= 0x80 && code <= 0x9f);

// 基于原始字符串统计 index 前的连续反斜杠数量，避免已解码结果影响后续 escape 判断。
const countPrecedingBackslashes = (str: string, index: number): number => {
    let count = 0;
    for (let i = index - 1; i >= 0 && str[i] === '\\'; i--) {
        count++;
    }
    return count;
};

// Unicode 解码（\uXXXX 格式）- 仅替换命中的转义片段，保留上下文
export const decodeUnicode = (str: string): string | null => {
    try {
        let result = '';
        let i = 0;
        let hasMatch = false;

        while (i < str.length) {
            if (str[i] === '\\' && i + 5 < str.length && str[i + 1] === 'u' && /^[0-9a-fA-F]{4}$/.test(str.substring(i + 2, i + 6))) {
                // 检查前面是否有反斜杠（避免匹配 \\u）
                const prevBackslash = countPrecedingBackslashes(str, i);
                if (prevBackslash % 2 === 0) {
                    // 单反斜杠，可以解码
                    const hex = str.substring(i + 2, i + 6);
                    const code = parseInt(hex, 16);
                    if (isUnsafeUnicodeDecodeTarget(code)) {
                        result += str.substring(i, i + 6);
                        i += 6;
                        continue;
                    }
                    result += String.fromCharCode(code);
                    i += 6;
                    hasMatch = true;
                    continue;
                }
            }
            result += str[i];
            i++;
        }

        return hasMatch ? result : null;
    } catch {
        return null;
    }
};

const isUtf8SurrogateCodePoint = (code: number): boolean => code >= 0xd800 && code <= 0xdfff;

interface HexEscapeToken {
    value: number;
    escape: string;
}

export const decodeUTF8Bytes = (bytes: number[]): string | null => {
    let result = '';
    let i = 0;

    while (i < bytes.length) {
        const byte = bytes[i];

        if (byte <= 0x7f) {
            result += String.fromCharCode(byte);
            i++;
            continue;
        }

        let code = 0;
        let continuationCount = 0;
        let minCodePoint = 0;

        if (byte >= 0xc2 && byte <= 0xdf) {
            code = byte & 0x1f;
            continuationCount = 1;
            minCodePoint = 0x80;
        } else if (byte >= 0xe0 && byte <= 0xef) {
            code = byte & 0x0f;
            continuationCount = 2;
            minCodePoint = 0x800;
        } else if (byte >= 0xf0 && byte <= 0xf4) {
            code = byte & 0x07;
            continuationCount = 3;
            minCodePoint = 0x10000;
        } else {
            return null;
        }

        if (i + continuationCount >= bytes.length) {
            return null;
        }

        for (let offset = 1; offset <= continuationCount; offset++) {
            const continuationByte = bytes[i + offset];
            if ((continuationByte & 0xc0) !== 0x80) {
                return null;
            }
            code = (code << 6) | (continuationByte & 0x3f);
        }

        if (code < minCodePoint || code > 0x10ffff || isUtf8SurrogateCodePoint(code)) {
            return null;
        }

        if (code >= 0x10000) {
            const high = Math.floor((code - 0x10000) / 0x400) + 0xd800;
            const low = ((code - 0x10000) % 0x400) + 0xdc00;
            result += String.fromCharCode(high, low);
        } else {
            result += String.fromCharCode(code);
        }
        i += continuationCount + 1;
    }

    return result;
};

export const isReadableHexDecoded = (decoded: string): boolean => {
    for (let i = 0; i < decoded.length; i++) {
        const code = decoded.codePointAt(i);
        if (code === undefined || isUnsafeUnicodeDecodeTarget(code) || isUtf8SurrogateCodePoint(code)) {
            return false;
        }
        if (code > 0xffff) {
            i++;
        }
    }
    return true;
};

const getUtf8SequenceLength = (byte: number): number | null => {
    if (byte <= 0x7f) return 1;
    if (byte >= 0xc2 && byte <= 0xdf) return 2;
    if (byte >= 0xe0 && byte <= 0xef) return 3;
    if (byte >= 0xf0 && byte <= 0xf4) return 4;
    return null;
};

const readHexEscapeRun = (str: string, startIndex: number): { tokens: HexEscapeToken[]; endIndex: number } => {
    const tokens: HexEscapeToken[] = [];
    let i = startIndex;
    while (i + 3 < str.length && str[i] === '\\' && str[i + 1] === 'x' && /^[0-9a-fA-F]{2}$/.test(str.substring(i + 2, i + 4))) {
        const escape = str.substring(i, i + 4);
        tokens.push({
            value: parseInt(str.substring(i + 2, i + 4), 16),
            escape,
        });
        i += 4;
    }
    return { tokens, endIndex: i };
};

// Hex 字节按原始 token 分段解码，控制字符和非法 UTF-8 保持原始 \xHH 文本。
const decodeHexEscapeTokens = (tokens: HexEscapeToken[]): { text: string; hasMatch: boolean } => {
    let text = '';
    let hasMatch = false;
    let i = 0;

    while (i < tokens.length) {
        const token = tokens[i];
        const sequenceLength = getUtf8SequenceLength(token.value);
        if (sequenceLength === null || i + sequenceLength > tokens.length) {
            text += token.escape;
            i++;
            continue;
        }

        const sequence = tokens.slice(i, i + sequenceLength);
        const decoded = decodeUTF8Bytes(sequence.map((item) => item.value));
        if (decoded !== null && isReadableHexDecoded(decoded)) {
            text += decoded;
            hasMatch = true;
            i += sequenceLength;
            continue;
        }

        if (decoded !== null) {
            text += sequence.map((item) => item.escape).join('');
            i += sequenceLength;
        } else {
            text += token.escape;
            i++;
        }
    }

    return { text, hasMatch };
};

// Hex 解码（\xHH 格式）- 仅替换连续命中的片段，保留上下文
export const decodeHex = (str: string): string | null => {
    try {
        let result = '';
        let i = 0;
        let hasMatch = false;

        while (i < str.length) {
            if (str[i] === '\\' && i + 3 < str.length && str[i + 1] === 'x' && /^[0-9a-fA-F]{2}$/.test(str.substring(i + 2, i + 4))) {
                const prevBackslash = countPrecedingBackslashes(str, i);
                if (prevBackslash % 2 === 0) {
                    const { tokens, endIndex } = readHexEscapeRun(str, i);
                    const decoded = decodeHexEscapeTokens(tokens);
                    if (decoded.hasMatch) {
                        result += decoded.text;
                        hasMatch = true;
                        i = endIndex;
                        continue;
                    }
                }
            }

            result += str[i];
            i++;
        }

        return hasMatch ? result : null;
    } catch {
        return null;
    }
};

// 混合 Unicode / Hex 解码只扫描原始字符串，避免 \u005C 生成的新反斜杠继续触发二次解码。
const decodeJsonEscapesOnce = (str: string): string | null => {
    try {
        let result = '';
        let i = 0;
        let hasMatch = false;

        while (i < str.length) {
            if (str[i] === '\\') {
                const prevBackslash = countPrecedingBackslashes(str, i);
                if (prevBackslash % 2 === 0) {
                    if (i + 5 < str.length && str[i + 1] === 'u' && /^[0-9a-fA-F]{4}$/.test(str.substring(i + 2, i + 6))) {
                        const hex = str.substring(i + 2, i + 6);
                        const code = parseInt(hex, 16);
                        if (isUnsafeUnicodeDecodeTarget(code)) {
                            result += str.substring(i, i + 6);
                            i += 6;
                            continue;
                        }
                        result += String.fromCharCode(code);
                        i += 6;
                        hasMatch = true;
                        continue;
                    }

                    if (i + 3 < str.length && str[i + 1] === 'x' && /^[0-9a-fA-F]{2}$/.test(str.substring(i + 2, i + 4))) {
                        const { tokens, endIndex } = readHexEscapeRun(str, i);
                        const decoded = decodeHexEscapeTokens(tokens);
                        if (decoded.hasMatch) {
                            result += decoded.text;
                            hasMatch = true;
                            i = endIndex;
                            continue;
                        }
                    }
                }
            }

            result += str[i];
            i++;
        }

        return hasMatch ? result : null;
    } catch {
        return null;
    }
};

// 检查字符串是否可能是某种编码格式
export const isLikelyEncoded = (str: string): boolean => {
    if (str.length === 0) return false;
    // Unicode 检测：包含 \uXXXX
    if (/\\u[0-9a-fA-F]{4}/.test(str)) {
        return true;
    }
    // Hex 检测：包含 \xHH
    if (/\\x[0-9a-fA-F]{2}/i.test(str)) {
        return true;
    }
    return false;
};

// 智能解码：仅做一层、局部替换式解码，避免整串被某一种编码误吞
export const smartDecode = (str: string): string => {
    if (!isLikelyEncoded(str)) {
        return str;
    }

    const decoded = decodeJsonEscapesOnce(str);
    return decoded && decoded !== str ? decoded : str;
};
