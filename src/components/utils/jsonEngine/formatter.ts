import JSON5 from 'json5';

import { smartDecode } from '../decode';
import { createHighPrecisionNumberWrapper, normalizeJsonNumberLiteral, tryParseHighPrecisionWrapper, tryReadHighPrecisionWrapperObject } from './numberLiteral';
import { preprocessSpecialJsonValues } from './preprocess';

interface PendingHexByte {
    value: number;
    escape: string;
}

export class JsonPlusFormatter {
    private encodingMode: boolean;
    private indentSize: number;
    private arrayNewLine: boolean;
    private preserveNumberLiterals: boolean;
    private escapePlaceholderCounter: number;
    private escapePlaceholderPrefix: string;
    private indentCache: string[];
    private static readonly SIMPLE_STRING_ESCAPE_RE = /["\\\u0000-\u001f\u007f-\u009f\uD800-\uDFFF\uE000]/;
    private static readonly NUMBER_LITERAL_PROTECTION_CANDIDATE_RE = /(?:\d\.|\.\d|\d[eE][+-]?\d|\d{16,})/;
    private static readonly ESCAPE_PLACEHOLDER_START = '\uE000';
    private static readonly ESCAPE_PLACEHOLDER_PREFIX_LENGTH = 12;
    private static readonly ESCAPE_PLACEHOLDER_ID_LENGTH = 2;

    constructor(encodingMode: boolean, indentSize: number, arrayNewLine: boolean, preserveNumberLiterals: boolean = false) {
        this.encodingMode = encodingMode;
        this.indentSize = indentSize;
        this.arrayNewLine = arrayNewLine;
        this.preserveNumberLiterals = preserveNumberLiterals;
        this.escapePlaceholderCounter = 0;
        this.escapePlaceholderPrefix = JsonPlusFormatter.createIndexedEscapePlaceholderPrefix(0);
        this.indentCache = [''];
    }

    // 严格 UTF-8 解码：只有完整合法的字节序列才返回字符串，否则交给调用方保留原始 \xHH。
    private decodeUTF8(bytes: number[]): string | null {
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

            if (code < minCodePoint || code > 0x10ffff || this.isSurrogate(code)) {
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
    }

    // 对 decodeUTF8 返回的字符串进行适配，确保放入 JSON 字符串字面中是合法的（控制字符需要转义）
    private escapeDecodedString(str: string): string {
        let out = '';
        for (let j = 0; j < str.length; j++) {
            const ch = str[j];
            const code = str.charCodeAt(j);
            if (this.isHighSurrogate(code) && j + 1 < str.length && this.isLowSurrogate(str.charCodeAt(j + 1))) {
                out += ch + str[j + 1];
                j++;
            } else if (this.isSurrogate(code)) {
                out += this.formatUnicodeEscape(code);
            } else if (ch === '\\') {
                out += '\\\\';
            } else if (ch === '"') {
                out += '\\"';
            } else if (ch === '\n') {
                out += '\\n';
            } else if (ch === '\r') {
                out += '\\r';
            } else if (ch === '\t') {
                out += '\\t';
            } else if (ch === '\b') {
                out += '\\b';
            } else if (ch === '\f') {
                out += '\\f';
            } else if (this.isJsonControlCode(code)) {
                out += this.formatUnicodeEscape(code);
            } else {
                out += ch;
            }
        }
        return out;
    }

    private getUtf8SequenceLength(byte: number): number | null {
        if (byte <= 0x7f) return 1;
        if (byte >= 0xc2 && byte <= 0xdf) return 2;
        if (byte >= 0xe0 && byte <= 0xef) return 3;
        if (byte >= 0xf0 && byte <= 0xf4) return 4;
        return null;
    }

    // 将无法组成合法 UTF-8 的 JSON5 Hex 字节先占位，最终输出为合法 JSON Unicode escape。
    private preservePendingHexByte(byte: PendingHexByte, escapeMap: Map<string, string>): string {
        const placeholder = this.createEscapePlaceholder();
        escapeMap.set(placeholder, byte.escape);
        return placeholder;
    }

    private flushPendingHexBytes(pendingBytes: PendingHexByte[], escapeMap: Map<string, string>): string {
        if (pendingBytes.length === 0) {
            return '';
        }

        let result = '';
        let i = 0;
        while (i < pendingBytes.length) {
            const byte = pendingBytes[i];
            const sequenceLength = this.getUtf8SequenceLength(byte.value);
            if (sequenceLength === null || i + sequenceLength > pendingBytes.length) {
                result += this.preservePendingHexByte(byte, escapeMap);
                i++;
                continue;
            }

            const sequence = pendingBytes.slice(i, i + sequenceLength);
            const decoded = this.decodeUTF8(sequence.map((item) => item.value));
            if (decoded !== null) {
                result += this.escapeDecodedString(decoded);
                i += sequenceLength;
                continue;
            }

            result += this.preservePendingHexByte(byte, escapeMap);
            i++;
        }

        pendingBytes.length = 0;
        return result;
    }

    private isHighSurrogate(code: number): boolean {
        return code >= 0xd800 && code <= 0xdbff;
    }

    private isLowSurrogate(code: number): boolean {
        return code >= 0xdc00 && code <= 0xdfff;
    }

    private isSurrogate(code: number): boolean {
        return code >= 0xd800 && code <= 0xdfff;
    }

    private isJsonControlCode(code: number): boolean {
        return code <= 0x1f || code === 0x7f || (code >= 0x80 && code <= 0x9f);
    }

    private formatUnicodeEscape(code: number): string {
        return '\\u' + code.toString(16).padStart(4, '0').toUpperCase();
    }

    private formatHexEscapeAsUnicodeEscape(escape: string): string {
        return '\\u00' + escape.slice(2).toUpperCase();
    }

    private static getRandomInt(maxExclusive: number): number {
        const cryptoObj = globalThis.crypto;
        if (cryptoObj?.getRandomValues) {
            const values = new Uint32Array(1);
            cryptoObj.getRandomValues(values);
            return values[0] % maxExclusive;
        }
        return Math.floor(Math.random() * maxExclusive);
    }

    private static createRandomEscapePlaceholderPrefix(): string {
        let prefix = JsonPlusFormatter.ESCAPE_PLACEHOLDER_START;
        for (let i = 1; i < JsonPlusFormatter.ESCAPE_PLACEHOLDER_PREFIX_LENGTH; i++) {
            prefix += String.fromCharCode(0xe001 + JsonPlusFormatter.getRandomInt(0xf8ff - 0xe001 + 1));
        }
        return prefix;
    }

    private static createIndexedEscapePlaceholderPrefix(index: number): string {
        let prefix = JsonPlusFormatter.ESCAPE_PLACEHOLDER_START;
        let value = index;
        for (let i = 1; i < JsonPlusFormatter.ESCAPE_PLACEHOLDER_PREFIX_LENGTH; i++) {
            prefix += String.fromCharCode(0xe001 + (value & 0x7ff));
            value = value >>> 11;
        }
        return prefix;
    }

    private prepareEscapePlaceholders(input: string): void {
        this.escapePlaceholderCounter = 0;

        for (let attempt = 0; attempt < 16; attempt++) {
            const prefix = JsonPlusFormatter.createRandomEscapePlaceholderPrefix();
            if (!input.includes(prefix)) {
                this.escapePlaceholderPrefix = prefix;
                return;
            }
        }

        for (let index = 0; index < 4096; index++) {
            const prefix = JsonPlusFormatter.createIndexedEscapePlaceholderPrefix(index);
            if (!input.includes(prefix)) {
                this.escapePlaceholderPrefix = prefix;
                return;
            }
        }

        this.escapePlaceholderPrefix = JsonPlusFormatter.createRandomEscapePlaceholderPrefix();
    }

    // 处理 \uXXXX 转义，返回 { consumed, append }
    private handleUnicodeEscape(input: string, startIndex: number, quote: string, escapeMap: Map<string, string>): { consumed: number; append: string } {
        // startIndex 指向反斜杠位置 '\\'
        const i = startIndex;
        if (i + 5 < input.length && /^[0-9a-fA-F]{4}$/.test(input.substr(i + 2, 4))) {
            const unicodeSeq = input.substr(i, 6); // \uXXXX
            if (this.encodingMode) {
                // 解码模式：保留 \uXXXX 交给 JSON 解析器自然解码为对应字符
                return { consumed: 6, append: unicodeSeq };
            } else {
                // 不解码模式：用占位符保护 \uXXXX，防止被 JSON 解析器解码
                const placeholder = this.createEscapePlaceholder();
                escapeMap.set(placeholder, unicodeSeq);
                return { consumed: 6, append: placeholder };
            }
        } else {
            // 非法 \u 转义，收集最多4个十六进制字符作为非法序列
            let invalidUSeq = '\\u';
            let idx = i + 2;
            let count = 0;
            while (idx < input.length && input[idx] !== quote && count < 4) {
                if (/^[0-9a-fA-F]$/.test(input[idx])) {
                    invalidUSeq += input[idx];
                    count++;
                    idx++;
                } else {
                    break;
                }
            }
            const placeholder = this.createEscapePlaceholder();
            escapeMap.set(placeholder, invalidUSeq);
            return { consumed: 2 + count, append: placeholder };
        }
    }

    // 处理 \xHH 转义，支持收集字节用于后续 UTF-8 解码
    private handleHexEscape(
        input: string,
        startIndex: number,
        quote: string,
        escapeMap: Map<string, string>,
        pendingBytes: PendingHexByte[],
    ): { consumed: number; append: string } {
        const i = startIndex;
        if (i + 3 < input.length && /^[0-9a-fA-F]{2}$/.test(input.substr(i + 2, 2))) {
            const hexSeq = input.substr(i, 4); // \xHH
            const byte = parseInt(input.substr(i + 2, 2), 16);
            if (this.encodingMode) {
                // 收集字节用于 UTF-8 解码，暂不 append
                pendingBytes.push({ value: byte, escape: hexSeq });
                return { consumed: 4, append: '' };
            } else {
                // 不解码模式：占位以保持原始 \xHH
                const placeholder = this.createEscapePlaceholder();
                escapeMap.set(placeholder, hexSeq);
                return { consumed: 4, append: placeholder };
            }
        } else {
            // 非法 \x 转义，收集连续十六进制字符（最多2个）
            let invalidXSeq = '\\x';
            let idx = i + 2;
            while (idx < input.length && input[idx] !== quote && /^[0-9a-fA-F]$/.test(input[idx])) {
                invalidXSeq += input[idx];
                idx++;
            }
            const placeholder = this.createEscapePlaceholder();
            escapeMap.set(placeholder, invalidXSeq);
            return { consumed: idx - i, append: placeholder };
        }
    }

    // 解析 JSON5 字符串，支持非法转义和特殊值
    parseJson5(input: string): { data: any; escapeMap: Map<string, string> } {
        this.prepareEscapePlaceholders(input);
        const escapeMap = new Map<string, string>();
        const needsNumberProtection = this.preserveNumberLiterals && this.mayContainNumberLiteralNeedingProtection(input);

        if (!needsNumberProtection && this.canUseNativeJsonParseFastPath(input)) {
            try {
                const data = JSON.parse(input);
                return {
                    data: this.encodingMode ? this.decodeParsedData(data) : data,
                    escapeMap,
                };
            } catch {
                // 不是严格 JSON 时继续走兼容预处理路径。
            }
        }

        // 预处理字符串，处理特殊值、转义等
        let processedInput = preprocessSpecialJsonValues(input);
        if (needsNumberProtection) {
            processedInput = this.preprocessHighPrecisionNumbers(processedInput);
        }
        processedInput = this.preprocessString(processedInput, escapeMap);

        try {
            let data: any;
            try {
                data = JSON.parse(processedInput);
            } catch {
                data = JSON5.parse(processedInput);
            }
            if (this.encodingMode) {
                data = this.decodeParsedData(data);
            }
            return { data, escapeMap };
        } catch (error) {
            throw new Error('JSON5 解析失败: ' + (error as Error).message);
        }
    }

    private decodeParsedData(value: any): any {
        if (typeof value === 'string') {
            return smartDecode(value);
        }
        if (Array.isArray(value)) {
            return value.map((item) => this.decodeParsedData(item));
        }
        if (value && typeof value === 'object') {
            const result: Record<string, any> = {};
            for (const key of Object.keys(value)) {
                result[key] = this.decodeParsedData(value[key]);
            }
            return result;
        }
        return value;
    }

    private mayContainNumberLiteralNeedingProtection(input: string): boolean {
        return JsonPlusFormatter.NUMBER_LITERAL_PROTECTION_CANDIDATE_RE.test(input);
    }

    private canUseNativeJsonParseFastPath(input: string): boolean {
        // 非解码模式下当前 formatter 会保护 \uXXXX / \xHH，直接 JSON.parse 会改变输出策略。
        if (!this.encodingMode && /\\[ux]/.test(input)) {
            return false;
        }
        return true;
    }

    private preprocessHighPrecisionNumbers(input: string): string {
        let result = '';
        let i = 0;
        let inString = false;
        let stringChar = '';
        let inLineComment = false;
        let inBlockComment = false;

        const isIdentifierChar = (ch: string) => /[A-Za-z0-9_$]/.test(ch);

        while (i < input.length) {
            const char = input[i];
            const next = input[i + 1] || '';

            if (inLineComment) {
                result += char;
                if (char === '\n') {
                    inLineComment = false;
                }
                i++;
                continue;
            }

            if (inBlockComment) {
                result += char;
                if (char === '*' && next === '/') {
                    result += next;
                    i += 2;
                    inBlockComment = false;
                    continue;
                }
                i++;
                continue;
            }

            if (inString) {
                result += char;
                if (char === '\\' && next) {
                    result += next;
                    i += 2;
                    continue;
                }
                if (char === stringChar) {
                    inString = false;
                    stringChar = '';
                }
                i++;
                continue;
            }

            if (char === '/' && next === '/') {
                result += char + next;
                i += 2;
                inLineComment = true;
                continue;
            }

            if (char === '/' && next === '*') {
                result += char + next;
                i += 2;
                inBlockComment = true;
                continue;
            }

            if (char === '"' || char === "'") {
                inString = true;
                stringChar = char;
                result += char;
                i++;
                continue;
            }

            const prevChar = i > 0 ? input[i - 1] : '';
            if ((char === '+' || char === '-' || char === '.' || (char >= '0' && char <= '9')) && !isIdentifierChar(prevChar)) {
                const slice = input.slice(i);
                const match = slice.match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
                if (match && match[0]) {
                    const token = match[0];
                    const nextChar = input[i + token.length] || '';
                    if (!isIdentifierChar(nextChar)) {
                        const isFloat = token.includes('.') || token.includes('e') || token.includes('E');
                        let needsProtection = isFloat;
                        if (!needsProtection) {
                            // 纯整数：若超出 JS 安全整数范围则同样需要保护，避免精度丢失
                            // 例如 7634073368949850917 这类 64-bit ID 会被 JSON.parse 四舍五入
                            const numValue = Number(token);
                            if (!Number.isFinite(numValue) || !Number.isSafeInteger(numValue)) {
                                needsProtection = true;
                            }
                        }
                        if (needsProtection) {
                            const wrapped = JSON.stringify(createHighPrecisionNumberWrapper(token));
                            result += wrapped;
                            i += token.length;
                            continue;
                        }
                    }
                }
            }

            result += char;
            i++;
        }

        return result;
    }

    // 生成转义占位符
    private createEscapePlaceholder(): string {
        const id = this.escapePlaceholderCounter++;
        const hi = 0xe001 + ((id >>> 10) & 0x7ff);
        const lo = 0xe001 + (id & 0x3ff);
        return this.escapePlaceholderPrefix + String.fromCharCode(hi) + String.fromCharCode(lo);
    }

    // 预处理字符串，处理非法转义和注释
    private preprocessString(input: string, escapeMap: Map<string, string>): string {
        let result = '';
        let i = 0;

        while (i < input.length) {
            const char = input[i];
            const nextChar = input[i + 1] || '';

            // 处理注释
            if (char === '/' && nextChar === '/') {
                // 单行注释 //
                i += 2;
                while (i < input.length && input[i] !== '\n') {
                    i++;
                }
                continue;
            } else if (char === '/' && nextChar === '*') {
                // 多行注释 /* */
                i += 2;
                while (i < input.length - 1) {
                    if (input[i] === '*' && input[i + 1] === '/') {
                        i += 2;
                        break;
                    }
                    i++;
                }
                continue;
            } else if (char === '#') {
                // # 单行注释（扩展支持）
                i++;
                while (i < input.length && input[i] !== '\n') {
                    i++;
                }
                continue;
            }

            if (char === '"' || char === "'") {
                // 处理字符串
                const quote = char;
                result += quote;
                i++;

                let stringContent = '';
                const pendingBytes: PendingHexByte[] = []; // 用于收集连续的\xHH字节

                while (i < input.length && input[i] !== quote) {
                    if (input[i] === '\\') {
                        // 处理转义
                        if (i + 1 < input.length) {
                            const nextChar = input[i + 1];

                            if (
                                nextChar === '\r' ||
                                nextChar === '\n' ||
                                nextChar === '\u2028' ||
                                nextChar === '\u2029' ||
                                nextChar === ' ' ||
                                nextChar === '\t'
                            ) {
                                let j = i + 1;
                                while (j < input.length && (input[j] === ' ' || input[j] === '\t')) {
                                    j++;
                                }
                                const ch = input[j] || '';
                                if (ch === '\r' || ch === '\n' || ch === '\u2028' || ch === '\u2029') {
                                    stringContent += this.flushPendingHexBytes(pendingBytes, escapeMap);

                                    if (ch === '\r' && input[j + 1] === '\n') {
                                        i = j + 2;
                                    } else {
                                        i = j + 1;
                                    }
                                    continue;
                                }
                            }

                            // 对于非标准转义
                            if (!['"', '\\', '/', 'b', 'f', 'n', 'r', 't'].includes(nextChar)) {
                                // 特殊处理 \u转义（包括非法格式）
                                if (nextChar === 'u') {
                                    stringContent += this.flushPendingHexBytes(pendingBytes, escapeMap);

                                    const res = this.handleUnicodeEscape(input, i, quote, escapeMap);
                                    stringContent += res.append;
                                    i += res.consumed;
                                    continue;
                                }
                                // 特殊处理 \xHH（包括非法格式）
                                if (nextChar === 'x') {
                                    const res = this.handleHexEscape(input, i, quote, escapeMap, pendingBytes);
                                    stringContent += res.append;
                                    i += res.consumed;
                                    continue;
                                } else {
                                    stringContent += this.flushPendingHexBytes(pendingBytes, escapeMap);

                                    // 其他非法转义
                                    const escapeSeq = '\\' + nextChar;
                                    const placeholder = this.createEscapePlaceholder();
                                    escapeMap.set(placeholder, escapeSeq);
                                    stringContent += placeholder;
                                    i += 2; // 跳过转义序列
                                }
                            } else {
                                stringContent += this.flushPendingHexBytes(pendingBytes, escapeMap);

                                // 标准转义序列直接保留，不需要占位符
                                // JSON5 能正确解析这些标准转义序列（如 \n \t \r 等）
                                // 这样可以避免占位符恢复时产生实际的控制字符破坏 JSON 结构
                                stringContent += '\\' + nextChar;
                                i += 2; // 跳过转义序列
                            }
                        } else {
                            stringContent += this.flushPendingHexBytes(pendingBytes, escapeMap);

                            stringContent += '\\';
                            i++;
                        }
                    } else {
                        stringContent += this.flushPendingHexBytes(pendingBytes, escapeMap);

                        stringContent += input[i];
                        i++;
                    }
                }

                stringContent += this.flushPendingHexBytes(pendingBytes, escapeMap);

                result += stringContent;

                if (i < input.length) {
                    result += quote;
                }
            } else {
                result += char;
            }
            i++;
        }

        return result;
    }

    // 格式化输出
    format(data: any, escapeMap: Map<string, string>): string {
        return this.customStringify(data, escapeMap);
    }

    // 压缩模式 - 生成紧凑的JSON字符串，不带缩进和换行
    compress(data: any, escapeMap: Map<string, string>): string {
        return this.customStringify(data, escapeMap, 0, true);
    }

    private getIndent(level: number): string {
        if (this.indentCache[level] === undefined) {
            this.indentCache[level] = ' '.repeat(level * this.indentSize);
        }
        return this.indentCache[level];
    }

    private isValidJsonEscape(escape: string): boolean {
        if (escape.length === 2) {
            return ['\\"', '\\\\', '\\/', '\\b', '\\f', '\\n', '\\r', '\\t'].includes(escape);
        }
        return /^\\u[0-9a-fA-F]{4}$/.test(escape);
    }

    private formatEscapePlaceholder(escape: string): string {
        if (this.encodingMode && /^\\x[0-9a-fA-F]{2}$/.test(escape)) {
            return this.formatHexEscapeAsUnicodeEscape(escape);
        }
        if (this.isValidJsonEscape(escape)) {
            return escape;
        }
        return '\\\\' + escape.slice(1);
    }

    private formatEscapePlaceholderAt(value: string, index: number, escapeMap: Map<string, string>): { text: string; length: number } | null {
        if (value[index] !== JsonPlusFormatter.ESCAPE_PLACEHOLDER_START) {
            return null;
        }

        const placeholderLength = JsonPlusFormatter.ESCAPE_PLACEHOLDER_PREFIX_LENGTH + JsonPlusFormatter.ESCAPE_PLACEHOLDER_ID_LENGTH;
        if (index + placeholderLength > value.length) {
            return null;
        }

        const placeholder = value.slice(index, index + placeholderLength);
        const originalEscape = escapeMap.get(placeholder);
        if (!originalEscape) {
            return null;
        }

        return {
            text: this.formatEscapePlaceholder(originalEscape),
            length: placeholderLength,
        };
    }

    // 格式化数字
    private formatNumber(num: number): string {
        return num.toString();
    }

    // 自定义字符串化函数
    private customStringify(data: any, escapeMap: Map<string, string>, indent: number = 0, compressed: boolean = false): string {
        if (data === null) {
            return 'null';
        }

        if (data === undefined) {
            return 'null'; // JSON标准中undefined转为null
        }

        if (typeof data === 'boolean') {
            return data ? 'true' : 'false';
        }

        if (typeof data === 'number') {
            if (isNaN(data) || !isFinite(data)) {
                return 'null';
            }
            return this.formatNumber(data);
        }

        const highPrecisionObjectLiteral = tryReadHighPrecisionWrapperObject(data);
        if (highPrecisionObjectLiteral !== null) {
            const normalizedLiteral = normalizeJsonNumberLiteral(highPrecisionObjectLiteral);
            if (normalizedLiteral !== null) return normalizedLiteral;
        }

        if (typeof data === 'string') {
            return this.formatString(data, escapeMap);
        }

        if (typeof data === 'function') {
            return 'null'; // JSON标准中function转为null
        }

        if (typeof data === 'symbol') {
            return 'null'; // JSON标准中symbol转为null
        }

        if (Array.isArray(data)) {
            return this.formatArray(data, escapeMap, indent, compressed);
        }

        if (typeof data === 'object') {
            return this.formatObject(data, escapeMap, indent, compressed);
        }

        return 'null'; // 其他未知类型转为null
    }

    // 格式化字符串
    private formatString(str: string, escapeMap: Map<string, string>): string {
        const processedStr = str;

        const highPrecisionLiteral = tryParseHighPrecisionWrapper(processedStr);
        if (highPrecisionLiteral !== null) {
            const normalizedLiteral = normalizeJsonNumberLiteral(highPrecisionLiteral);
            if (normalizedLiteral !== null) return normalizedLiteral;
        }

        if (!JsonPlusFormatter.SIMPLE_STRING_ESCAPE_RE.test(processedStr)) {
            return '"' + processedStr + '"';
        }

        let result = '"';

        for (let i = 0; i < processedStr.length; i++) {
            const char = processedStr[i];
            const formattedPlaceholder = this.formatEscapePlaceholderAt(processedStr, i, escapeMap);
            if (formattedPlaceholder) {
                result += formattedPlaceholder.text;
                i += formattedPlaceholder.length - 1;
                continue;
            }
            const code = processedStr.charCodeAt(i);

            // 控制字符必须保持转义
            if (this.isHighSurrogate(code) && i + 1 < processedStr.length && this.isLowSurrogate(processedStr.charCodeAt(i + 1))) {
                result += char + processedStr[i + 1];
                i++;
            } else if (this.isSurrogate(code)) {
                result += this.formatUnicodeEscape(code);
            } else if (char === '\n') {
                result += '\\n';
            } else if (char === '\t') {
                result += '\\t';
            } else if (char === '\r') {
                result += '\\r';
            } else if (char === '\b') {
                result += '\\b';
            } else if (char === '\f') {
                result += '\\f';
            } else if (char === '"') {
                result += '\\"';
            } else if (char === '\\') {
                result += '\\\\';
            } else if (this.isJsonControlCode(code)) {
                // 其他控制字符
                result += this.formatUnicodeEscape(code);
            } else {
                // 解码模式下，解码后的字符可能包含特殊字符，需要处理
                result += char;
            }
        }

        result += '"';
        return result;
    }

    // 格式化数组
    private formatArray(arr: any[], escapeMap: Map<string, string>, indent: number, compressed: boolean = false): string {
        if (arr.length === 0) {
            return '[]';
        }

        if (compressed) {
            // 压缩模式：始终生成紧凑格式
            let result = '[';
            for (let i = 0; i < arr.length; i++) {
                if (i > 0) result += ',';
                result += this.customStringify(arr[i], escapeMap, 0, true);
            }
            return result + ']';
        }

        if (!this.arrayNewLine) {
            let isSimpleArray = true;
            for (let i = 0; i < arr.length; i++) {
                const item = arr[i];
                if (!(typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' || item === null)) {
                    isSimpleArray = false;
                    break;
                }
            }

            if (isSimpleArray) {
                let result = '[';
                for (let i = 0; i < arr.length; i++) {
                    if (i > 0) result += ', ';
                    result += this.customStringify(arr[i], escapeMap, 0, false);
                }
                return result + ']';
            }
        }

        // 换行模式（复杂数组或强制换行）
        const indentStr = this.getIndent(indent + 1);
        const nextIndentStr = this.getIndent(indent);
        let result = '[\n';
        for (let i = 0; i < arr.length; i++) {
            if (i > 0) result += ',\n';
            result += indentStr + this.customStringify(arr[i], escapeMap, indent + 1, false);
        }
        return result + '\n' + nextIndentStr + ']';
    }

    // 格式化对象
    private formatObject(obj: any, escapeMap: Map<string, string>, indent: number, compressed: boolean = false): string {
        const keys = Object.keys(obj);
        if (keys.length === 0) {
            return '{}';
        }

        if (compressed) {
            // 压缩模式：生成紧凑格式
            let result = '{';
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const keyStr = this.formatKey(key, escapeMap); // 处理对象键，key 不进行 smartDecode
                const valueStr = this.customStringify(obj[key], escapeMap, 0, true);
                if (i > 0) result += ',';
                result += keyStr + ':' + valueStr;
            }
            return result + '}';
        }

        const indentStr = this.getIndent(indent + 1);
        const nextIndentStr = this.getIndent(indent);

        let result = '{\n';
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const keyStr = this.formatKey(key, escapeMap); // 处理对象键，key 不进行 smartDecode
            const valueStr = this.customStringify(obj[key], escapeMap, indent + 1, compressed);
            if (i > 0) result += ',\n';
            result += indentStr + keyStr + ': ' + valueStr;
        }

        return result + '\n' + nextIndentStr + '}';
    }

    // 格式化对象 key（不进行 smartDecode，保持原始格式）
    private formatKey(key: string, escapeMap: Map<string, string>): string {
        if (!JsonPlusFormatter.SIMPLE_STRING_ESCAPE_RE.test(key)) {
            return '"' + key + '"';
        }

        let result = '"';

        for (let i = 0; i < key.length; i++) {
            const char = key[i];
            const formattedPlaceholder = this.formatEscapePlaceholderAt(key, i, escapeMap);
            if (formattedPlaceholder) {
                result += formattedPlaceholder.text;
                i += formattedPlaceholder.length - 1;
                continue;
            }
            const code = key.charCodeAt(i);

            // 控制字符必须保持转义
            if (this.isHighSurrogate(code) && i + 1 < key.length && this.isLowSurrogate(key.charCodeAt(i + 1))) {
                result += char + key[i + 1];
                i++;
            } else if (this.isSurrogate(code)) {
                result += this.formatUnicodeEscape(code);
            } else if (char === '\n') {
                result += '\\n';
            } else if (char === '\t') {
                result += '\\t';
            } else if (char === '\r') {
                result += '\\r';
            } else if (char === '\b') {
                result += '\\b';
            } else if (char === '\f') {
                result += '\\f';
            } else if (char === '"') {
                result += '\\"';
            } else if (char === '\\') {
                result += '\\\\';
            } else if (this.isJsonControlCode(code)) {
                // 其他控制字符
                result += this.formatUnicodeEscape(code);
            } else {
                result += char;
            }
        }

        result += '"';
        return result;
    }
}
