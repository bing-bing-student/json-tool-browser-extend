export type JsonToolSampleLocale = 'zh' | 'en';

export const FIRST_USE_SAMPLE_JSON_ZH = String.raw`{
    // 顶层对象注释
    # 工具扩展支持的 hash 注释
    /* 块注释：metadata 上方 */
    metadata: {
        name: 'JSON5 regression fixture',
        version: '2026-06-26',
        enabled: true,
        disabled: false,
        empty: null,
        trailingComma: 'yes',
    },

    // undefined 作为字符串 key：key 不能被替换，value 应转成 null
    "undefined": undefined,

    // 字符串内部的 undefined：不能被替换
    stringUndefinedCases: {
        normal: 'undefined',
        embeddedJson: "{\"value\":undefined,\"key\":\"undefined\"}",
        escapedQuotes: 'He said: "undefined is just text"',
    },

    // 各类注释位置
    commentCases: {
        // value 上方注释
        beforeValue: 1,
        afterValue: 2, // 行尾注释
        hashAfterValue: 3, # hash 行尾注释
        /* block 注释写在字段上方 */
        blockBeforeValue: 4,
        blockAfterValue: 5, /* inline block comment */
        nestedLookingComment: '/* not a comment */ // not a comment # not a comment',
    },

    // JSON5 数字
    numberCases: {
        integer: 123,
        negative: -123,
        positive: +123,
        leadingDot: .5,
        trailingDot: 5.,
        exponentPlus: 1.23e+10,
        exponentMinus: 1.23e-10,
        hex: 0x10,
        negativeHex: -0x20,
        infinity: Infinity,
        negativeInfinity: -Infinity,
        nanValue: NaN,
        negativeZero: -0,
        bigIntegerAsNumber: 900719925474099312345,
        preciseDecimalLike: 1.23000000000000000001,
    },

    // 字符串与转义
    stringCases: {
        singleQuote: 'single quoted string',
        doubleQuote: "double quoted string",
        quoteInsideSingle: 'He said "hello"',
        quoteInsideDouble: "It's fine",
        backslash: "C:\\Users\\test\\file.json",
        slashScript: "<\/script>",
        realScript: "<\u002fscript>",
        unicodeEscaped: "\u4F60\u597D",
        hexEscaped: "\xE4\xBD\xA0",
        newlineEscaped: "line1\nline2",
        tabEscaped: "a\tb",
        jsonStringValue: "{\"a\":1,\"b\":undefined,\"c\":\"undefined\"}",
    },

    // 单引号、多行续行
    multilineCases: {
        continued: 'line one \
        line two \
        line three',
        escapedNewlineText: 'line one\nline two\nline three',
    },

    // 数组：尾逗号、注释、混合类型
    arrayCases: [
        // 数组元素上方注释
        1,
        2,
        3, // trailing comments
        undefined, # value 位置，应该转成 null
        {
            child: 'object in array',
            value: undefined,
            text: 'object child',
        },
        [
            'nested',
            undefined,
            0x10,
            NaN,
        ],
    ],

    // 对象数组，适合测试排序/提取 key
    users: [
        {
            id: 3,
            name: 'Charlie',
            score: 88.50,
            tags: ['json', 'json5', 'comment',],
            extra: undefined,
        },
        {
            id: 1,
            name: 'Alice',
            score: 100,
            tags: ['alpha', 'beta'],
            extra: null,
        },
        {
            id: 2,
            name: 'Bob',
            score: .75,
            tags: [],
            extra: undefined,
        },
    ],

    // 特殊值扩展：只保留 undefined value 转 null
    specialValueCases: {
        undefinedValue: undefined,
        nullValue: null,
        stringUndefined: 'undefined',
        nestedUndefined: {
            a: undefined,
            b: 'undefined',
            c: {
                d: undefined,
            },
        },
        arrayUndefined: [
            undefined,
            'undefined',
            {
                value: undefined,
            },
        ],
    },

    // 重复 key：JSON/JSON5 解析后通常保留最后一个
    duplicateKeyCases: {
        duplicated: 1,
        duplicated: 2,
        duplicated: undefined,
    },

    // 递归转义 JSON：用于测试去除转义，内部包含 Unicode、Hex 编码和英文
    recursiveEscapedJson: "{\"payload\":\"{\\\"unicode\\\":\\\"\\\\u4F60\\\\u597D\\\",\\\"hex\\\":\\\"\\\\x48\\\\x65\\\\x6C\\\\x6C\\\\x6F\\\",\\\"english\\\":\\\"hello recursive escape\\\"}\"}",
    recursiveEscapedJsonArray: "[\"{\\\"message\\\":\\\"English text\\\",\\\"unicode\\\":\\\"\\\\u4E16\\\\u754C\\\",\\\"hex\\\":\\\"\\\\x4A\\\\x53\\\\x4F\\\\x4E\\\"}\"]",
}`;

export const FIRST_USE_SAMPLE_JSON_EN = FIRST_USE_SAMPLE_JSON_ZH.replace('// 顶层对象注释', '// Top-level object comment')
    .replace('# 工具扩展支持的 hash 注释', '# Hash comment supported by this tool')
    .replace('/* 块注释：metadata 上方 */', '/* Block comment above metadata */')
    .replace('// undefined 作为字符串 key：key 不能被替换，value 应转成 null', '// undefined as a string key: the key must stay, the value should become null')
    .replace('// 字符串内部的 undefined：不能被替换', '// undefined inside strings must not be replaced')
    .replace('// 各类注释位置', '// Comment placement cases')
    .replace('// value 上方注释', '// Comment above a value')
    .replace('// 行尾注释', '// trailing line comment')
    .replace('# hash 行尾注释', '# trailing hash comment')
    .replace('/* block 注释写在字段上方 */', '/* block comment above a field */')
    .replace('// JSON5 数字', '// JSON5 number cases')
    .replace('// 字符串与转义', '// Strings and escapes')
    .replace('// 单引号、多行续行', '// Single quotes and multiline continuation')
    .replace('// 数组：尾逗号、注释、混合类型', '// Arrays: trailing commas, comments, and mixed types')
    .replace('// 数组元素上方注释', '// Comment above an array item')
    .replace('# value 位置，应该转成 null', '# value position, should become null')
    .replace('// 对象数组，适合测试排序/提取 key', '// Object array, useful for testing sort and extract-by-key actions')
    .replace('// 特殊值扩展：只保留 undefined value 转 null', '// Special value extension: only undefined values become null')
    .replace('// 重复 key：JSON/JSON5 解析后通常保留最后一个', '// Duplicate keys: JSON / JSON5 parsers usually keep the last value')
    .replace('// 递归转义 JSON：用于测试去除转义，内部包含 Unicode、Hex 编码和英文', '// Recursively escaped JSON: useful for unescape testing, includes Unicode, Hex, and English text');

export const getFirstUseSampleJson = (locale?: JsonToolSampleLocale) => (locale === 'en' ? FIRST_USE_SAMPLE_JSON_EN : FIRST_USE_SAMPLE_JSON_ZH);
