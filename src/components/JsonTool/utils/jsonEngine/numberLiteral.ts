// 数据转换专用哨兵前缀/后缀：用于在 YAML/TOML/XML/Go 输出中标记"应当以无引号原字面量形式出现的数字"
const HPN_SENTINEL_PREFIX = '__HPN_START_7f3a9c__';
const HPN_SENTINEL_SUFFIX = '__HPN_END_7f3a9c__';
const HPN_WRAPPER_KEY = '__jsonToolHighPrecisionNumber';
const HPN_WRAPPER_SECRET_KEY = '__jsonToolHighPrecisionNumberSecret';
const HPN_WRAPPER_SECRET = createRuntimeSecret();

const PROTECTED_NUMBER_LITERAL_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const STRICT_JSON_NUMBER_LITERAL_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

function createRuntimeSecret(): string {
    const cryptoObj = globalThis.crypto;
    if (cryptoObj?.getRandomValues) {
        const bytes = new Uint32Array(4);
        cryptoObj.getRandomValues(bytes);
        return Array.from(bytes, (n) => n.toString(36)).join('-');
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export const normalizeJsonNumberLiteral = (literal: string): string | null => {
    let normalized = literal.trim();
    if (!PROTECTED_NUMBER_LITERAL_RE.test(normalized)) return null;

    let sign = '';
    if (normalized[0] === '+') {
        normalized = normalized.slice(1);
    } else if (normalized[0] === '-') {
        sign = '-';
        normalized = normalized.slice(1);
    }

    const exponentMatch = normalized.match(/[eE][+-]?\d+$/);
    const exponent = exponentMatch?.[0] ?? '';
    let mantissa = exponent ? normalized.slice(0, -exponent.length) : normalized;

    if (mantissa.startsWith('.')) {
        mantissa = '0' + mantissa;
    }
    if (mantissa.endsWith('.')) {
        mantissa += '0';
    }

    const dotIndex = mantissa.indexOf('.');
    if (dotIndex === -1) {
        mantissa = mantissa.replace(/^0+(?=\d)/, '') || '0';
    } else {
        const integerPart = mantissa.slice(0, dotIndex).replace(/^0+(?=\d)/, '') || '0';
        mantissa = integerPart + mantissa.slice(dotIndex);
    }

    const jsonNumber = sign + mantissa + exponent;
    return STRICT_JSON_NUMBER_LITERAL_RE.test(jsonNumber) ? jsonNumber : null;
};

export const createHighPrecisionNumberWrapper = (literal: string): string => {
    return JSON.stringify({
        [HPN_WRAPPER_KEY]: true,
        [HPN_WRAPPER_SECRET_KEY]: HPN_WRAPPER_SECRET,
        originalString: literal,
    });
};

export const tryReadHighPrecisionWrapperObject = (value: any): string | null => {
    if (
        value &&
        typeof value === 'object' &&
        value[HPN_WRAPPER_KEY] === true &&
        value[HPN_WRAPPER_SECRET_KEY] === HPN_WRAPPER_SECRET &&
        typeof value.originalString === 'string' &&
        normalizeJsonNumberLiteral(value.originalString) !== null
    ) {
        return value.originalString;
    }
    return null;
};

export const tryParseHighPrecisionWrapper = (str: string): string | null => {
    // 轻量检查，避免对无关字符串执行 JSON.parse
    if (typeof str !== 'string' || str.length < 10 || str.indexOf(HPN_WRAPPER_KEY) === -1) {
        return null;
    }
    try {
        const parsed = JSON.parse(str);
        return tryReadHighPrecisionWrapperObject(parsed);
    } catch {
        // 忽略
    }
    return null;
};

export const unwrapHighPrecisionForConvert = (data: any): any => {
    const walk = (node: any): any => {
        if (node === null || node === undefined) return node;
        if (typeof node === 'string') {
            const literal = tryParseHighPrecisionWrapper(node);
            if (literal !== null) {
                const normalizedLiteral = normalizeJsonNumberLiteral(literal);
                if (normalizedLiteral === null) return node;

                const num = Number(normalizedLiteral);
                // 安全整数/有限浮点 且字面量 toString 后能精确还原时，直接用真实 Number。
                if (Number.isFinite(num)) {
                    const isInteger = !/[.eE]/.test(normalizedLiteral);
                    if (isInteger && Number.isSafeInteger(num) && String(num) === normalizedLiteral) {
                        return num;
                    }
                    if (!isInteger && String(num) === normalizedLiteral) {
                        return num;
                    }
                }
                // 精度敏感（超大整数 / 需要保留末尾零或指数形态）→ 用哨兵占位。
                return HPN_SENTINEL_PREFIX + normalizedLiteral + HPN_SENTINEL_SUFFIX;
            }
            return node;
        }
        if (Array.isArray(node)) {
            return node.map(walk);
        }
        if (typeof node === 'object') {
            const result: Record<string, any> = {};
            for (const key of Object.keys(node)) {
                result[key] = walk(node[key]);
            }
            return result;
        }
        return node;
    };
    return walk(data);
};

export const restoreHighPrecisionInOutput = (output: string): string => {
    // 先匹配"被引号包裹的哨兵"：双引号 / 单引号 两种常见情况。
    const quotedPattern = new RegExp(`(["'])${HPN_SENTINEL_PREFIX}([^"']*?)${HPN_SENTINEL_SUFFIX}\\1`, 'g');
    let restored = output.replace(quotedPattern, (_m, _q, literal) => literal);
    // 再匹配"未被引号包裹的哨兵"（例如 XML 文本节点内）。
    const rawPattern = new RegExp(`${HPN_SENTINEL_PREFIX}([^]*?)${HPN_SENTINEL_SUFFIX}`, 'g');
    restored = restored.replace(rawPattern, (_m, literal) => literal);
    return restored;
};
