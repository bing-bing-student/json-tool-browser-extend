export type JsonFormatterDecodeCaseCategory =
    | 'unicode'
    | 'surrogate'
    | 'hex'
    | 'standard-json-escape'
    | 'invalid-escape'
    | 'mixed-encoding'
    | 'url-base64-boundary'
    | 'container';

export interface JsonFormatterDecodeCase {
    id: string;
    category: JsonFormatterDecodeCaseCategory;
    description: string;
    input: string;
    decodedOutput: string;
    nonDecodedOutput: string;
}

export const JSON_FORMATTER_DECODE_CASE_OPTIONS = {
    indentSize: 4,
    arrayNewLine: true,
    preserveNumberLiterals: false,
} as const;

const BS = '\\';
const q = (content: string) => `"${content}"`;
const array = (items: string[]) => `[\n${items.map((item) => `    ${item}`).join(',\n')}\n]`;
const object = (entries: Array<[string, string]>) => `{\n${entries.map(([key, value]) => `    ${key}: ${value}`).join(',\n')}\n}`;
const LEGACY_ESCAPE_PLACEHOLDER_TEXT = String.fromCharCode(0xe000, 0xe001, 0xe001);

export const JSON_FORMATTER_DECODE_CASES: JsonFormatterDecodeCase[] = [
    {
        id: 'unicode-standard-escape',
        category: 'unicode',
        description: '标准 JSON Unicode escape 开启解码后输出真实字符，关闭解码时保留 escape。',
        input: q(`${BS}u4F60`),
        decodedOutput: q('你'),
        nonDecodedOutput: q(`${BS}u4F60`),
    },
    {
        id: 'unicode-literal-escape-text',
        category: 'unicode',
        description: '字面量 \\uXXXX 文本开启解码后按 Unicode escape 解码。',
        input: q(`${BS.repeat(2)}u4F60`),
        decodedOutput: q('你'),
        nonDecodedOutput: q(`${BS.repeat(2)}u4F60`),
    },
    {
        id: 'unicode-placeholder-private-use-collision',
        category: 'unicode',
        description: '用户真实私有区字符不能和内部 escape 占位符碰撞，避免关闭解码时被误恢复成其他 escape。',
        input: object([
            ['"escaped"', q(`${BS}u4F60`)],
            ['"collision"', q(LEGACY_ESCAPE_PLACEHOLDER_TEXT)],
        ]),
        decodedOutput: object([
            ['"escaped"', q('你')],
            ['"collision"', q(LEGACY_ESCAPE_PLACEHOLDER_TEXT)],
        ]),
        nonDecodedOutput: object([
            ['"escaped"', q(`${BS}u4F60`)],
            ['"collision"', q(LEGACY_ESCAPE_PLACEHOLDER_TEXT)],
        ]),
    },
    {
        id: 'unicode-literal-control-escape-preserved',
        category: 'unicode',
        description: '字面量控制字符 escape 即使开启解码也保持原样，避免嵌套 JSON / 二进制片段被改写。',
        input: q(`${BS.repeat(2)}u0000${BS.repeat(2)}u001F${BS.repeat(2)}u0085`),
        decodedOutput: q(`${BS.repeat(2)}u0000${BS.repeat(2)}u001F${BS.repeat(2)}u0085`),
        nonDecodedOutput: q(`${BS.repeat(2)}u0000${BS.repeat(2)}u001F${BS.repeat(2)}u0085`),
    },
    {
        id: 'unicode-readable-and-control-mixed',
        category: 'unicode',
        description: '同一字符串中可读 Unicode 继续解码，控制字符 escape 保持原样。',
        input: q(`${BS.repeat(2)}u4F60-${BS.repeat(2)}u0000-${BS.repeat(2)}u597D`),
        decodedOutput: q(`你-${BS.repeat(2)}u0000-好`),
        nonDecodedOutput: q(`${BS.repeat(2)}u4F60-${BS.repeat(2)}u0000-${BS.repeat(2)}u597D`),
    },
    {
        id: 'unicode-standard-control-escape-preserved',
        category: 'unicode',
        description: '标准 JSON 控制字符 escape 被 parser 解成真实字符后，输出时仍必须恢复为 Unicode escape。',
        input: object([
            ['"c0"', q(`${BS}u0000`)],
            ['"del"', q(`${BS}u007F`)],
            ['"c1"', q(`${BS}u0085`)],
            ['"mixed"', q(`${BS}u4F60${BS}u0085${BS}u597D`)],
        ]),
        decodedOutput: object([
            ['"c0"', q(`${BS}u0000`)],
            ['"del"', q(`${BS}u007F`)],
            ['"c1"', q(`${BS}u0085`)],
            ['"mixed"', q(`你${BS}u0085好`)],
        ]),
        nonDecodedOutput: object([
            ['"c0"', q(`${BS}u0000`)],
            ['"del"', q(`${BS}u007F`)],
            ['"c1"', q(`${BS}u0085`)],
            ['"mixed"', q(`${BS}u4F60${BS}u0085${BS}u597D`)],
        ]),
    },
    {
        id: 'unicode-standard-control-key-preserved',
        category: 'unicode',
        description: '标准 JSON 控制字符 escape 出现在对象 key 中时也必须保持转义输出。',
        input: object([
            [`"${BS}u0085"`, q('value')],
            [`"${BS}u009F"`, q('inner')],
        ]),
        decodedOutput: object([
            [`"${BS}u0085"`, q('value')],
            [`"${BS}u009F"`, q('inner')],
        ]),
        nonDecodedOutput: object([
            [`"${BS}u0085"`, q('value')],
            [`"${BS}u009F"`, q('inner')],
        ]),
    },
    {
        id: 'unicode-interrupted-by-one-literal-backslash',
        category: 'unicode',
        description: '一个字面量反斜杠 + Unicode escape，只解码 escape 部分。',
        input: q(`${BS.repeat(3)}u4F60`),
        decodedOutput: q(`${BS.repeat(2)}你`),
        nonDecodedOutput: q(`${BS.repeat(3)}u4F60`),
    },
    {
        id: 'unicode-even-literal-backslashes',
        category: 'unicode',
        description: '两个字面量反斜杠 + uXXXX 文本，不构成可解码 escape。',
        input: q(`${BS.repeat(4)}u4F60`),
        decodedOutput: q(`${BS.repeat(4)}u4F60`),
        nonDecodedOutput: q(`${BS.repeat(4)}u4F60`),
    },
    {
        id: 'unicode-two-literal-backslashes-then-escape',
        category: 'unicode',
        description: '两个字面量反斜杠 + Unicode escape，保留反斜杠并解码 escape。',
        input: q(`${BS.repeat(5)}u4F60`),
        decodedOutput: q(`${BS.repeat(4)}你`),
        nonDecodedOutput: q(`${BS.repeat(5)}u4F60`),
    },
    {
        id: 'unicode-invalid-short',
        category: 'invalid-escape',
        description: '非法 \\u 序列不能硬解码，输出合法 JSON 字面量。',
        input: q(`${BS}u12G4`),
        decodedOutput: q(`${BS.repeat(2)}u12G4`),
        nonDecodedOutput: q(`${BS.repeat(2)}u12G4`),
    },
    {
        id: 'unicode-invalid-empty',
        category: 'invalid-escape',
        description: '不完整 \\u 序列输出为合法 JSON 字面量。',
        input: q(`${BS}u`),
        decodedOutput: q(`${BS.repeat(2)}u`),
        nonDecodedOutput: q(`${BS.repeat(2)}u`),
    },
    {
        id: 'surrogate-standard-pair',
        category: 'surrogate',
        description: '连续合法高低代理项开启解码后组成 emoji。',
        input: q(`${BS}uD83D${BS}uDE00`),
        decodedOutput: q('😀'),
        nonDecodedOutput: q(`${BS}uD83D${BS}uDE00`),
    },
    {
        id: 'surrogate-literal-pair',
        category: 'surrogate',
        description: '字面量高低代理项 escape 文本开启解码后组成 emoji。',
        input: q(`${BS.repeat(2)}uD83D${BS.repeat(2)}uDE00`),
        decodedOutput: q('😀'),
        nonDecodedOutput: q(`${BS.repeat(2)}uD83D${BS.repeat(2)}uDE00`),
    },
    {
        id: 'surrogate-pair-interrupted-by-backslashes',
        category: 'surrogate',
        description: '高低代理项被字面量反斜杠隔开时不能组成 emoji，必须保留为合法 Unicode escape。',
        input: q(`${BS.repeat(3)}uD83D${BS.repeat(3)}uDE00`),
        decodedOutput: q(`${BS.repeat(3)}uD83D${BS.repeat(3)}uDE00`),
        nonDecodedOutput: q(`${BS.repeat(3)}uD83D${BS.repeat(3)}uDE00`),
    },
    {
        id: 'surrogate-isolated-high',
        category: 'surrogate',
        description: '孤立高代理项不能输出乱码，必须保留为 Unicode escape。',
        input: q(`${BS}uD83D`),
        decodedOutput: q(`${BS}uD83D`),
        nonDecodedOutput: q(`${BS}uD83D`),
    },
    {
        id: 'surrogate-isolated-low',
        category: 'surrogate',
        description: '孤立低代理项不能输出乱码，必须保留为 Unicode escape。',
        input: q(`${BS}uDE00`),
        decodedOutput: q(`${BS}uDE00`),
        nonDecodedOutput: q(`${BS}uDE00`),
    },
    {
        id: 'hex-json5-utf8-sequence',
        category: 'hex',
        description: '连续合法 JSON5 Hex 字节序列开启解码后按 UTF-8 解码。',
        input: q(`${BS}xE4${BS}xBD${BS}xA0`),
        decodedOutput: q('你'),
        nonDecodedOutput: q(`${BS.repeat(2)}xE4${BS.repeat(2)}xBD${BS.repeat(2)}xA0`),
    },
    {
        id: 'hex-json5-control-utf8-preserved',
        category: 'hex',
        description: 'JSON5 Hex 解出的 C1 控制字符输出时必须恢复为 Unicode escape。',
        input: object([
            ['"c1"', q(`${BS}xC2${BS}x85`)],
            ['"mixed"', q(`${BS}xE4${BS}xBD${BS}xA0${BS}xC2${BS}x85`)],
        ]),
        decodedOutput: object([
            ['"c1"', q(`${BS}u0085`)],
            ['"mixed"', q(`你${BS}u0085`)],
        ]),
        nonDecodedOutput: object([
            ['"c1"', q(`${BS.repeat(2)}xC2${BS.repeat(2)}x85`)],
            ['"mixed"', q(`${BS.repeat(2)}xE4${BS.repeat(2)}xBD${BS.repeat(2)}xA0${BS.repeat(2)}xC2${BS.repeat(2)}x85`)],
        ]),
    },
    {
        id: 'hex-json5-valid-prefix-before-invalid-tail',
        category: 'hex',
        description: 'JSON5 Hex 字节流中合法 UTF-8 前缀应继续解码，残缺或非法尾部逐字节保留为 Unicode escape。',
        input: object([
            ['"incomplete"', q(`${BS}xE4${BS}xBD${BS}xA0${BS}xE4${BS}xBD`)],
            ['"invalid"', q(`${BS}xE4${BS}xBD${BS}xA0${BS}xE4${BS}x41`)],
            ['"overlong"', q(`${BS}xE4${BS}xBD${BS}xA0${BS}xC0${BS}xAF`)],
        ]),
        decodedOutput: object([
            ['"incomplete"', q(`你${BS}u00E4${BS}u00BD`)],
            ['"invalid"', q(`你${BS}u00E4A`)],
            ['"overlong"', q(`你${BS}u00C0${BS}u00AF`)],
        ]),
        nonDecodedOutput: object([
            ['"incomplete"', q(`${BS.repeat(2)}xE4${BS.repeat(2)}xBD${BS.repeat(2)}xA0${BS.repeat(2)}xE4${BS.repeat(2)}xBD`)],
            ['"invalid"', q(`${BS.repeat(2)}xE4${BS.repeat(2)}xBD${BS.repeat(2)}xA0${BS.repeat(2)}xE4${BS.repeat(2)}x41`)],
            ['"overlong"', q(`${BS.repeat(2)}xE4${BS.repeat(2)}xBD${BS.repeat(2)}xA0${BS.repeat(2)}xC0${BS.repeat(2)}xAF`)],
        ]),
    },
    {
        id: 'hex-json5-before-unicode-keeps-order',
        category: 'mixed-encoding',
        description: 'JSON5 Hex 后接 Unicode escape 时必须先落盘 Hex pending bytes，避免输出顺序反转。',
        input: object([
            ['"ascii"', q(`${BS}x41${BS}u4F60`)],
            ['"utf8"', q(`${BS}xE4${BS}xBD${BS}xA0${BS}u597D`)],
            ['"backslash"', q(`${BS}x5C${BS}u4F60`)],
        ]),
        decodedOutput: object([
            ['"ascii"', q('A你')],
            ['"utf8"', q('你好')],
            ['"backslash"', q(`${BS.repeat(2)}你`)],
        ]),
        nonDecodedOutput: object([
            ['"ascii"', q(`${BS.repeat(2)}x41${BS}u4F60`)],
            ['"utf8"', q(`${BS.repeat(2)}xE4${BS.repeat(2)}xBD${BS.repeat(2)}xA0${BS}u597D`)],
            ['"backslash"', q(`${BS.repeat(2)}x5C${BS}u4F60`)],
        ]),
    },
    {
        id: 'hex-literal-utf8-sequence',
        category: 'hex',
        description: '字面量 \\xHH 文本开启解码后按 UTF-8 解码。',
        input: q(`${BS.repeat(2)}xE4${BS.repeat(2)}xBD${BS.repeat(2)}xA0`),
        decodedOutput: q('你'),
        nonDecodedOutput: q(`${BS.repeat(2)}xE4${BS.repeat(2)}xBD${BS.repeat(2)}xA0`),
    },
    {
        id: 'hex-literal-non-cjk-unicode',
        category: 'hex',
        description: '字面量 Hex UTF-8 解码不限于中文，其他可显示 Unicode 字符也应解码。',
        input: object([
            ['"omega"', q(`${BS.repeat(2)}xCE${BS.repeat(2)}xA9`)],
            ['"kana"', q(`${BS.repeat(2)}xE3${BS.repeat(2)}x81${BS.repeat(2)}x82`)],
            ['"emoji"', q(`${BS.repeat(2)}xF0${BS.repeat(2)}x9F${BS.repeat(2)}x98${BS.repeat(2)}x80`)],
        ]),
        decodedOutput: object([
            ['"omega"', q('Ω')],
            ['"kana"', q('あ')],
            ['"emoji"', q('😀')],
        ]),
        nonDecodedOutput: object([
            ['"omega"', q(`${BS.repeat(2)}xCE${BS.repeat(2)}xA9`)],
            ['"kana"', q(`${BS.repeat(2)}xE3${BS.repeat(2)}x81${BS.repeat(2)}x82`)],
            ['"emoji"', q(`${BS.repeat(2)}xF0${BS.repeat(2)}x9F${BS.repeat(2)}x98${BS.repeat(2)}x80`)],
        ]),
    },
    {
        id: 'hex-literal-control-byte-preserved-in-mixed-run',
        category: 'hex',
        description: '字面量 Hex UTF-8 中可显示字符继续解码，控制字符字节保持原始 \\xHH 文本。',
        input: object([
            ['"nul"', q(`${BS.repeat(2)}xE4${BS.repeat(2)}xBD${BS.repeat(2)}xA0${BS.repeat(2)}x00`)],
            ['"c1"', q(`${BS.repeat(2)}xE4${BS.repeat(2)}xBD${BS.repeat(2)}xA0${BS.repeat(2)}xC2${BS.repeat(2)}x85`)],
            ['"ascii"', q(`${BS.repeat(2)}x41${BS.repeat(2)}x00`)],
        ]),
        decodedOutput: object([
            ['"nul"', q(`你${BS.repeat(2)}x00`)],
            ['"c1"', q(`你${BS.repeat(2)}xC2${BS.repeat(2)}x85`)],
            ['"ascii"', q(`A${BS.repeat(2)}x00`)],
        ]),
        nonDecodedOutput: object([
            ['"nul"', q(`${BS.repeat(2)}xE4${BS.repeat(2)}xBD${BS.repeat(2)}xA0${BS.repeat(2)}x00`)],
            ['"c1"', q(`${BS.repeat(2)}xE4${BS.repeat(2)}xBD${BS.repeat(2)}xA0${BS.repeat(2)}xC2${BS.repeat(2)}x85`)],
            ['"ascii"', q(`${BS.repeat(2)}x41${BS.repeat(2)}x00`)],
        ]),
    },
    {
        id: 'hex-interrupted-by-literal-backslashes',
        category: 'hex',
        description: 'Hex 字节被字面量反斜杠隔开时不能组成 UTF-8，解码模式回退为合法 Unicode escape。',
        input: q(`${BS.repeat(3)}xE4${BS.repeat(3)}xBD${BS.repeat(3)}xA0`),
        decodedOutput: q(`${BS.repeat(3)}u00E4${BS.repeat(3)}u00BD${BS.repeat(3)}u00A0`),
        nonDecodedOutput: q(`${BS.repeat(4)}xE4${BS.repeat(4)}xBD${BS.repeat(4)}xA0`),
    },
    {
        id: 'hex-incomplete',
        category: 'invalid-escape',
        description: '不完整 \\x 序列输出为合法 JSON 字面量。',
        input: q(`${BS}xE`),
        decodedOutput: q(`${BS.repeat(2)}xE`),
        nonDecodedOutput: q(`${BS.repeat(2)}xE`),
    },
    {
        id: 'hex-invalid-digit',
        category: 'invalid-escape',
        description: '非法 \\x 序列输出为合法 JSON 字面量。',
        input: q(`${BS}xG1`),
        decodedOutput: q(`${BS.repeat(2)}xG1`),
        nonDecodedOutput: q(`${BS.repeat(2)}xG1`),
    },
    {
        id: 'hex-invalid-single-utf8-byte',
        category: 'hex',
        description: '单个非 ASCII Hex 字节无法构成合法 UTF-8，解码模式转为 Unicode escape。',
        input: q(`${BS}xE4`),
        decodedOutput: q(`${BS}u00E4`),
        nonDecodedOutput: q(`${BS.repeat(2)}xE4`),
    },
    {
        id: 'hex-invalid-overlong-utf8',
        category: 'hex',
        description: '非法 UTF-8 字节序列不能输出 replacement char，逐字节转为 Unicode escape。',
        input: q(`${BS}xC0${BS}xAF`),
        decodedOutput: q(`${BS}u00C0${BS}u00AF`),
        nonDecodedOutput: q(`${BS.repeat(2)}xC0${BS.repeat(2)}xAF`),
    },
    {
        id: 'hex-literal-invalid-overlong-utf8',
        category: 'hex',
        description: '字面量非法 UTF-8 Hex 文本开启解码时保持原样，避免 overlong 被宽松解成 ASCII。',
        input: q(`${BS.repeat(2)}xC0${BS.repeat(2)}xAF`),
        decodedOutput: q(`${BS.repeat(2)}xC0${BS.repeat(2)}xAF`),
        nonDecodedOutput: q(`${BS.repeat(2)}xC0${BS.repeat(2)}xAF`),
    },
    {
        id: 'hex-valid-emoji-utf8',
        category: 'hex',
        description: '合法 4 字节 UTF-8 Hex 序列开启解码后输出 emoji。',
        input: q(`${BS}xF0${BS}x9F${BS}x98${BS}x80`),
        decodedOutput: q('😀'),
        nonDecodedOutput: q(`${BS.repeat(2)}xF0${BS.repeat(2)}x9F${BS.repeat(2)}x98${BS.repeat(2)}x80`),
    },
    {
        id: 'standard-newline',
        category: 'standard-json-escape',
        description: '标准换行转义保持为合法 JSON escape。',
        input: q(`line${BS}nnext`),
        decodedOutput: q(`line${BS}nnext`),
        nonDecodedOutput: q(`line${BS}nnext`),
    },
    {
        id: 'standard-tab',
        category: 'standard-json-escape',
        description: '标准 tab 转义保持为合法 JSON escape。',
        input: q(`tab${BS}tend`),
        decodedOutput: q(`tab${BS}tend`),
        nonDecodedOutput: q(`tab${BS}tend`),
    },
    {
        id: 'standard-quote',
        category: 'standard-json-escape',
        description: '标准引号转义保持为合法 JSON escape。',
        input: q(`quote:${BS}"`),
        decodedOutput: q(`quote:${BS}"`),
        nonDecodedOutput: q(`quote:${BS}"`),
    },
    {
        id: 'invalid-plain-letter-escape',
        category: 'invalid-escape',
        description: '普通非法转义不能交给 JSON 解析失败，输出合法字面量。',
        input: q(`${BS}q`),
        decodedOutput: q(`${BS.repeat(2)}q`),
        nonDecodedOutput: q(`${BS.repeat(2)}q`),
    },
    {
        id: 'mixed-literal-unicode-and-literal-hex',
        category: 'mixed-encoding',
        description: '同一字符串中混合字面量 Unicode 与 Hex 编码时分别按规则解码。',
        input: q(`hello-${BS.repeat(2)}u4F60-${BS.repeat(2)}xE4${BS.repeat(2)}xBD${BS.repeat(2)}xA0`),
        decodedOutput: q('hello-你-你'),
        nonDecodedOutput: q(`hello-${BS.repeat(2)}u4F60-${BS.repeat(2)}xE4${BS.repeat(2)}xBD${BS.repeat(2)}xA0`),
    },
    {
        id: 'mixed-unicode-created-hex-not-redecoded',
        category: 'mixed-encoding',
        description: 'Unicode 解出的反斜杠不能继续触发新形成的 Hex escape，避免跨编码二次解码。',
        input: q(`${BS.repeat(2)}u005Cx41`),
        decodedOutput: q(`${BS.repeat(2)}x41`),
        nonDecodedOutput: q(`${BS.repeat(2)}u005Cx41`),
    },
    {
        id: 'mixed-hex-created-backslash-before-original-unicode',
        category: 'mixed-encoding',
        description: 'Hex 解出的反斜杠不能阻止后续原始 Unicode escape 解码。',
        input: q(`${BS.repeat(2)}x5C${BS.repeat(2)}u4F60`),
        decodedOutput: q(`${BS.repeat(2)}你`),
        nonDecodedOutput: q(`${BS.repeat(2)}x5C${BS.repeat(2)}u4F60`),
    },
    {
        id: 'mixed-unicode-created-backslash-before-original-hex',
        category: 'mixed-encoding',
        description: 'Unicode 解出的反斜杠不能阻止后续原始 Hex escape 解码。',
        input: q(`${BS.repeat(2)}u005C${BS.repeat(2)}x41`),
        decodedOutput: q(`${BS.repeat(2)}A`),
        nonDecodedOutput: q(`${BS.repeat(2)}u005C${BS.repeat(2)}x41`),
    },
    {
        id: 'mixed-interrupted-unicode-and-hex',
        category: 'mixed-encoding',
        description: '混合场景里被反斜杠打断的编码单元不能被跨段合并。',
        input: q(`x-${BS.repeat(3)}u4F60-${BS.repeat(3)}xE4`),
        decodedOutput: q(`x-${BS.repeat(2)}你-${BS.repeat(3)}u00E4`),
        nonDecodedOutput: q(`x-${BS.repeat(3)}u4F60-${BS.repeat(4)}xE4`),
    },
    {
        id: 'url-encoded-text-boundary',
        category: 'url-base64-boundary',
        description: 'URL 编码不是 JSON escape，格式化阶段不自动解码。',
        input: q('%E4%BD%A0'),
        decodedOutput: q('%E4%BD%A0'),
        nonDecodedOutput: q('%E4%BD%A0'),
    },
    {
        id: 'base64-text-boundary',
        category: 'url-base64-boundary',
        description: 'Base64 不是 JSON escape，格式化阶段不自动解码。',
        input: q('5L2g5aW9'),
        decodedOutput: q('5L2g5aW9'),
        nonDecodedOutput: q('5L2g5aW9'),
    },
    {
        id: 'url-and-unicode-mixed-boundary',
        category: 'url-base64-boundary',
        description: '混合 URL 编码与 Unicode escape 时只处理 JSON 字符串 escape。',
        input: q(`%E4%BD%A0-${BS.repeat(2)}u4F60`),
        decodedOutput: q('%E4%BD%A0-你'),
        nonDecodedOutput: q(`%E4%BD%A0-${BS.repeat(2)}u4F60`),
    },
    {
        id: 'base64-and-hex-mixed-boundary',
        category: 'url-base64-boundary',
        description: '混合 Base64 与 Hex escape 时只处理 JSON 字符串 escape。',
        input: q(`5L2g5aW9-${BS.repeat(2)}xE4${BS.repeat(2)}xBD${BS.repeat(2)}xA0`),
        decodedOutput: q('5L2g5aW9-你'),
        nonDecodedOutput: q(`5L2g5aW9-${BS.repeat(2)}xE4${BS.repeat(2)}xBD${BS.repeat(2)}xA0`),
    },
    {
        id: 'array-mixed-string-values',
        category: 'container',
        description: '数组里的字符串值递归遵循同一套解码规则。',
        input: array([q(`${BS}u4F60`), q(`${BS.repeat(2)}u597D`), q(`${BS}xE4${BS}xBD${BS}xA0`), q('%E4%BD%A0')]),
        decodedOutput: array([q('你'), q('好'), q('你'), q('%E4%BD%A0')]),
        nonDecodedOutput: array([q(`${BS}u4F60`), q(`${BS.repeat(2)}u597D`), q(`${BS.repeat(2)}xE4${BS.repeat(2)}xBD${BS.repeat(2)}xA0`), q('%E4%BD%A0')]),
    },
    {
        id: 'object-standard-escaped-key-and-value',
        category: 'container',
        description: '标准 JSON escape 出现在 key/value 中时，解码模式可自然输出字符，非解码模式保留 escape。',
        input: object([[q(`${BS}u4F60`), q(`${BS}u597D`)]]),
        decodedOutput: object([[q('你'), q('好')]]),
        nonDecodedOutput: object([[q(`${BS}u4F60`), q(`${BS}u597D`)]]),
    },
    {
        id: 'object-literal-escaped-key-boundary',
        category: 'container',
        description: '字面量编码 key 不做二次解码，避免不同 key 解码后碰撞；value 仍按解码规则处理。',
        input: object([[q(`${BS.repeat(2)}u4F60`), q(`${BS.repeat(2)}u597D`)]]),
        decodedOutput: object([[q(`${BS.repeat(2)}u4F60`), q('好')]]),
        nonDecodedOutput: object([[q(`${BS.repeat(2)}u4F60`), q(`${BS.repeat(2)}u597D`)]]),
    },
];
