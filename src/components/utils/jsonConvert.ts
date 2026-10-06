export type JsonConvertErrorCode =
    | 'CONVERT_YAML_FAILED'
    | 'CONVERT_TOML_FAILED'
    | 'CONVERT_XML_FAILED'
    | 'CONVERT_GO_FAILED'
    | 'CONVERT_TYPESCRIPT_FAILED'
    | 'COOKIE_INPUT_EMPTY'
    | 'COOKIE_INPUT_IS_JSON'
    | 'COOKIE_NO_VALID_PAIRS'
    | 'COOKIE_INVALID_FORMAT';

export class JsonConvertError extends Error {
    code: JsonConvertErrorCode;
    detail?: string;

    constructor(code: JsonConvertErrorCode, detail?: string) {
        super(code);
        this.name = 'JsonConvertError';
        this.code = code;
        this.detail = detail;
    }
}

const getErrorDetail = (error: unknown): string | undefined => {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string' && error) return error;
    return undefined;
};

// JSON 转 YAML（使用 js-yaml 库）
export const convertToYAML = async (obj: any): Promise<string> => {
    try {
        const yaml = await import('js-yaml');
        return yaml.dump(obj, {
            indent: 2,
            lineWidth: -1, // 不换行
            quotingType: '"', // 使用双引号
            forceQuotes: false, // 非必要不添加引号
            skipInvalid: true, // 跳过无效值
            sortKeys: false, // 保持键的原始顺序
        });
    } catch (error) {
        throw new JsonConvertError('CONVERT_YAML_FAILED', getErrorDetail(error));
    }
};

const TOML_BARE_KEY_RE = /^[A-Za-z0-9_-]+$/;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    return Object.prototype.toString.call(value) === '[object Object]';
};

const formatTomlKey = (key: string): string => {
    return TOML_BARE_KEY_RE.test(key) ? key : `"${escapeTomlString(key)}"`;
};

const formatTomlPath = (path: string[]): string => {
    return path.map(formatTomlKey).join('.');
};

const escapeTomlString = (value: string): string => {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\u0008/g, '\\b')
        .replace(/\t/g, '\\t')
        .replace(/\n/g, '\\n')
        .replace(/\f/g, '\\f')
        .replace(/\r/g, '\\r');
};

const stringifyTomlFallback = (value: unknown): string => {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
};

const formatTomlInlineValue = (value: unknown): string | null => {
    if (value === null || value === undefined) return '""';

    if (typeof value === 'string') return `"${escapeTomlString(value)}"`;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : `"${String(value)}"`;
    if (typeof value === 'bigint') return String(value);

    if (Array.isArray(value)) {
        const items = value.map(formatTomlInlineValue);
        if (items.some((item) => item === null)) return `"${escapeTomlString(stringifyTomlFallback(value))}"`;
        return `[${items.join(', ')}]`;
    }

    if (isPlainObject(value)) {
        const entries = Object.entries(value);
        const parts: string[] = [];
        for (const [key, childValue] of entries) {
            const formatted = formatTomlInlineValue(childValue);
            if (formatted === null) return null;
            parts.push(`${formatTomlKey(key)} = ${formatted}`);
        }
        return `{ ${parts.join(', ')} }`;
    }

    return `"${escapeTomlString(String(value))}"`;
};

const writeTomlTable = (value: Record<string, unknown>, path: string[], lines: string[]) => {
    const nestedTables: Array<[string, Record<string, unknown>]> = [];
    const arrayTables: Array<[string, Record<string, unknown>[]]> = [];

    for (const [key, childValue] of Object.entries(value)) {
        if (isPlainObject(childValue)) {
            nestedTables.push([key, childValue]);
            continue;
        }

        if (Array.isArray(childValue) && childValue.length > 0 && childValue.every(isPlainObject)) {
            arrayTables.push([key, childValue]);
            continue;
        }

        const formatted = formatTomlInlineValue(childValue);
        lines.push(`${formatTomlKey(key)} = ${formatted ?? `"${escapeTomlString(stringifyTomlFallback(childValue))}"`}`);
    }

    for (const [key, childObject] of nestedTables) {
        if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
        const childPath = [...path, key];
        lines.push(`[${formatTomlPath(childPath)}]`);
        writeTomlTable(childObject, childPath, lines);
    }

    for (const [key, childArray] of arrayTables) {
        const childPath = [...path, key];
        for (const item of childArray) {
            if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
            lines.push(`[[${formatTomlPath(childPath)}]]`);
            writeTomlTable(item, childPath, lines);
        }
    }
};

const stringifyToml = (value: unknown): string => {
    const root = Array.isArray(value) ? { items: value } : value;
    if (!isPlainObject(root)) {
        return `value = ${formatTomlInlineValue(root) ?? `"${escapeTomlString(stringifyTomlFallback(root))}"`}`;
    }

    const lines: string[] = [];
    writeTomlTable(root, [], lines);
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
};

// JSON 转 TOML（本地轻量 stringify，避免把完整 TOML 第三方库拉进首屏转换包）
export const convertToTOML = async (obj: any): Promise<string> => {
    try {
        return stringifyToml(obj);
    } catch (error) {
        throw new JsonConvertError('CONVERT_TOML_FAILED', getErrorDetail(error));
    }
};

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

const isValidXmlCharCode = (code: number): boolean => {
    return (
        code === 0x09 ||
        code === 0x0a ||
        code === 0x0d ||
        (code >= 0x20 && code <= 0xd7ff) ||
        (code >= 0xe000 && code <= 0xfffd) ||
        (code >= 0x10000 && code <= 0x10ffff)
    );
};

const sanitizeXmlText = (value: string): string => {
    let result = '';
    for (const char of value) {
        const code = char.codePointAt(0);
        if (code !== undefined && isValidXmlCharCode(code)) {
            result += char;
        }
    }
    return result;
};

const escapeXmlText = (value: string): string => {
    return sanitizeXmlText(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};

const sanitizeXmlTagName = (name: string): string => {
    let sanitized = String(name).replace(/[^A-Za-z0-9_-]/g, '_');
    if (!sanitized) return 'item';
    if (!/^[A-Za-z_]/.test(sanitized)) {
        sanitized = `item${sanitized}`;
    }
    return sanitized;
};

const formatXmlPrimitiveValue = (value: unknown): string => {
    if (typeof value === 'bigint') return String(value);
    return String(value);
};

const writeXmlElement = (key: string, value: unknown, lines: string[], depth: number): void => {
    const tagName = sanitizeXmlTagName(key);
    const indent = '  '.repeat(depth);

    if (value === null || value === undefined) {
        lines.push(`${indent}<${tagName}/>`);
        return;
    }

    if (Array.isArray(value)) {
        if (value.length === 0) {
            lines.push(`${indent}<${tagName}/>`);
            return;
        }

        lines.push(`${indent}<${tagName}>`);
        for (const item of value) {
            writeXmlElement('item', item, lines, depth + 1);
        }
        lines.push(`${indent}</${tagName}>`);
        return;
    }

    if (isPlainObject(value)) {
        const entries = Object.entries(value);
        if (entries.length === 0) {
            lines.push(`${indent}<${tagName}/>`);
            return;
        }

        lines.push(`${indent}<${tagName}>`);
        for (const [childKey, childValue] of entries) {
            writeXmlElement(childKey, childValue, lines, depth + 1);
        }
        lines.push(`${indent}</${tagName}>`);
        return;
    }

    lines.push(`${indent}<${tagName}>${escapeXmlText(formatXmlPrimitiveValue(value))}</${tagName}>`);
};

const stringifyXml = (value: unknown, rootName: string): string => {
    const lines = [XML_DECLARATION];
    writeXmlElement(rootName, value, lines, 0);
    return lines.join('\n');
};

// JSON 转 XML（本地轻量 stringify，避免引入完整 XML 构建库造成浏览器兼容告警与额外依赖）
export const convertToXML = async (obj: any, rootName: string = 'root'): Promise<string> => {
    try {
        return stringifyXml(obj, rootName);
    } catch (error) {
        throw new JsonConvertError('CONVERT_XML_FAILED', getErrorDetail(error));
    }
};

// JSON 转 Go 结构体（合并同名结构体样本，支持递归数组结构）
export const convertToGo = (obj: any): string => {
    let result = '';

    const commonInitialisms = new Map(
        [
            'ACL',
            'API',
            'ASCII',
            'CPU',
            'CSS',
            'DNS',
            'EOF',
            'GUID',
            'HTML',
            'HTTP',
            'HTTPS',
            'ID',
            'IP',
            'JSON',
            'LHS',
            'QPS',
            'RAM',
            'RHS',
            'RPC',
            'SLA',
            'SMTP',
            'SQL',
            'SSH',
            'TCP',
            'TLS',
            'TTL',
            'UDP',
            'UI',
            'UID',
            'UUID',
            'URI',
            'URL',
            'UTF8',
            'VM',
            'XML',
            'XMPP',
            'XSRF',
            'XSS',
        ].map((item) => [item.toLowerCase(), item] as const),
    );

    const splitGoNameParts = (str: string): string[] => {
        return str
            .replace(/[^a-zA-Z0-9]+/g, ' ')
            .split(/\s+/)
            .filter(Boolean)
            .flatMap((part) => part.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/g) || []);
    };

    const toGoExportedName = (str: string): string => {
        const parts = splitGoNameParts(str);
        if (parts.length === 0) {
            return 'Field';
        }

        const exportedName = parts
            .map((part) => {
                const initialism = commonInitialisms.get(part.toLowerCase());
                if (initialism) {
                    return initialism;
                }
                return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
            })
            .join('');

        return /^\d/.test(exportedName) ? `Field${exportedName}` : exportedName;
    };

    // 生成结构体名称
    const getStructName = (key: string): string => {
        return toGoExportedName(key);
    };

    type FieldSamples = Map<string, any[]>;
    const structSchemas = new Map<string, FieldSamples>();
    const structOrder: string[] = [];

    const isPlainObject = (value: any): value is Record<string, any> => {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    };

    const isNumericKey = (key: string): boolean => /^\d+$/.test(key);

    const isUuidLikeKey = (key: string): boolean => {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key);
    };

    const isLocaleLikeKey = (key: string): boolean => {
        return /^[a-z]{2,3}(?:[-_](?:[A-Z]{2}|\d{3}|[A-Za-z]{4,8}))+$/.test(key);
    };

    const isDynamicSuffixKey = (key: string): boolean => {
        return /^(?:[a-z][a-z0-9]*[-_])+\d+$/i.test(key);
    };

    const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, '');

    const commonFieldKeys = new Set([
        'id',
        'uid',
        'uuid',
        'name',
        'title',
        'type',
        'status',
        'code',
        'message',
        'msg',
        'data',
        'meta',
        'result',
        'value',
        'count',
        'total',
        'page',
        'size',
        'list',
        'items',
        'detail',
        'description',
        'desc',
        'content',
        'label',
        'key',
        'path',
        'url',
        'uri',
        'ip',
        'host',
        'port',
        'user',
        'userid',
        'username',
        'email',
        'phone',
        'mobile',
        'age',
        'gender',
        'address',
        'city',
        'province',
        'country',
        'createdat',
        'updatedat',
        'deletedat',
        'starttime',
        'endtime',
        'success',
        'error',
        'enabled',
        'disabled',
    ]);

    const isCommonFieldKey = (key: string): boolean => {
        return commonFieldKeys.has(normalizeKey(key));
    };

    const getObjectSignature = (value: Record<string, any>): string => {
        return Object.keys(value)
            .sort()
            .map((key) => {
                const childValue = value[key];
                if (Array.isArray(childValue)) return `${key}:array`;
                if (isPlainObject(childValue)) return `${key}:object`;
                if (childValue === null) return `${key}:null`;
                return `${key}:${typeof childValue}`;
            })
            .join('|');
    };

    const getValueKind = (value: any): string => {
        if (Array.isArray(value)) {
            const elements = value.filter((item) => item !== null && item !== undefined);
            if (elements.length === 0) return 'array:any';
            const elementKinds = [...new Set(elements.map(getValueKind))].sort();
            return `array:${elementKinds.join('|')}`;
        }
        if (isPlainObject(value)) {
            return `object:${getObjectSignature(value)}`;
        }
        if (value === null) return 'null';
        return typeof value;
    };

    // struct / map 判定不再只看 numeric key，而是综合考虑：
    // 1) key 是否像动态索引（数字 / UUID / locale / xxx_123）
    // 2) value 是否高度同构（例如 map[string]User / map[string]string）
    // 3) key 是否更像固定业务字段（id/name/type/...）
    const isMapLikeObject = (value: Record<string, any>): boolean => {
        const keys = Object.keys(value);
        if (keys.length === 0) return false;

        const nonNullValues = Object.values(value).filter((item) => item !== null && item !== undefined);
        if (nonNullValues.length === 0) return false;

        let score = 0;

        if (keys.length <= 2) {
            score -= 1;
        } else if (keys.length <= 4) {
            score -= 2;
        } else if (keys.length >= 8) {
            score += 1;
        }

        const numericKeyCount = keys.filter(isNumericKey).length;
        const uuidKeyCount = keys.filter(isUuidLikeKey).length;
        const localeKeyCount = keys.filter(isLocaleLikeKey).length;
        const dynamicSuffixKeyCount = keys.filter(isDynamicSuffixKey).length;
        const commonFieldKeyCount = keys.filter(isCommonFieldKey).length;

        if (numericKeyCount === keys.length) score += 4;
        else if (numericKeyCount >= 2 && numericKeyCount >= Math.ceil(keys.length / 2)) score += 3;

        if (uuidKeyCount === keys.length) score += 4;
        else if (uuidKeyCount >= 2 && uuidKeyCount >= Math.ceil(keys.length / 2)) score += 3;

        if (localeKeyCount === keys.length) score += 3;
        else if (localeKeyCount >= 2 && localeKeyCount >= Math.ceil(keys.length / 2)) score += 2;

        if (dynamicSuffixKeyCount >= 2 && dynamicSuffixKeyCount >= Math.ceil(keys.length / 2)) {
            score += 2;
        }

        if (commonFieldKeyCount >= Math.ceil(keys.length * 0.6)) {
            score -= 3;
        }

        const valueKinds = [...new Set(nonNullValues.map(getValueKind))];
        if (valueKinds.length === 1) {
            if (valueKinds[0].startsWith('object:')) {
                score += 4;
            } else if (valueKinds[0].startsWith('array:')) {
                score += 3;
            } else {
                score += 3;
            }
        } else if (valueKinds.length >= 3) {
            score -= 3;
        } else {
            score -= 1;
        }

        return score >= 3;
    };

    const getMapValueTypeName = (key: string): string => `${getStructName(key)}Value`;

    const ensureStructSchema = (structName: string): FieldSamples => {
        let schema = structSchemas.get(structName);
        if (!schema) {
            schema = new Map<string, any[]>();
            structSchemas.set(structName, schema);
            structOrder.push(structName);
        }
        return schema;
    };

    const collectMapValueSchemas = (values: any[], key: string) => {
        const nonNullValues = values.filter((value) => value !== null && value !== undefined);
        const mapValueTypeName = getMapValueTypeName(key);

        for (const value of nonNullValues) {
            if (Array.isArray(value)) {
                collectArrayElementSchemas(value, mapValueTypeName);
            } else if (isPlainObject(value)) {
                collectObjectSchemas([value], mapValueTypeName);
            }
        }
    };

    const collectObjectSchemas = (objects: Record<string, any>[], key: string) => {
        const nonEmptyObjects = objects.filter((obj) => Object.keys(obj).length > 0);
        if (nonEmptyObjects.length === 0) return;

        if (nonEmptyObjects.every(isMapLikeObject)) {
            collectMapValueSchemas(
                nonEmptyObjects.flatMap((obj) => Object.values(obj)),
                key,
            );
            return;
        }

        const structName = getStructName(key);
        for (const objectValue of nonEmptyObjects) {
            collectStructSchema(objectValue, structName);
        }
    };

    const collectArrayElementSchemas = (arrayValue: any[], key: string) => {
        for (const item of arrayValue) {
            if (isPlainObject(item)) {
                collectObjectSchemas([item], key);
            } else if (Array.isArray(item)) {
                collectArrayElementSchemas(item, key);
            }
        }
    };

    const collectStructSchema = (value: Record<string, any>, structName: string) => {
        const schema = ensureStructSchema(structName);

        for (const [key, fieldValue] of Object.entries(value)) {
            const samples = schema.get(key) || [];
            samples.push(fieldValue);
            schema.set(key, samples);

            if (Array.isArray(fieldValue)) {
                collectArrayElementSchemas(fieldValue, key);
            } else if (isPlainObject(fieldValue)) {
                collectObjectSchemas([fieldValue], key);
            }
        }
    };

    const inferPrimitiveType = (values: any[]): string => {
        const nonNullValues = values.filter((value) => value !== null && value !== undefined);
        if (nonNullValues.length === 0) return 'any';

        const hasString = nonNullValues.some((value) => typeof value === 'string');
        const hasBool = nonNullValues.some((value) => typeof value === 'boolean');
        const numbers = nonNullValues.filter((value) => typeof value === 'number');
        const hasOther = nonNullValues.some((value) => !['string', 'number', 'boolean'].includes(typeof value));

        if (hasOther) return 'any';
        if (hasString && !hasBool && numbers.length === 0) return 'string';
        if (hasBool && !hasString && numbers.length === 0) return 'bool';
        if (numbers.length === nonNullValues.length) {
            return numbers.every(Number.isInteger) ? 'int' : 'float64';
        }

        return 'any';
    };

    const inferArrayType = (arrays: any[][], key: string): string => {
        const elements = arrays.flat().filter((value) => value !== null && value !== undefined);
        if (elements.length === 0) return '[]any';

        const objectElements = elements.filter(isPlainObject);
        const primitiveElements = elements.filter((value) => !Array.isArray(value) && !isPlainObject(value));
        const nestedArrays = elements.filter(Array.isArray);

        if (objectElements.length > 0) {
            if (primitiveElements.length > 0 || nestedArrays.length > 0) return '[]any';
            return `[]${inferObjectTypeFromSamples(objectElements, key)}`;
        }

        if (nestedArrays.length > 0) {
            if (primitiveElements.length > 0) return '[]any';
            const nestedType = inferArrayType(nestedArrays, key);
            return `[]${nestedType}`;
        }

        return `[]${inferPrimitiveType(elements)}`;
    };

    const inferObjectTypeFromSamples = (objects: Record<string, any>[], key: string): string => {
        const nonEmptyObjects = objects.filter((obj) => Object.keys(obj).length > 0);
        if (nonEmptyObjects.length === 0) return getStructName(key);

        if (nonEmptyObjects.every(isMapLikeObject)) {
            const mapValueSamples = nonEmptyObjects.flatMap((obj) => Object.values(obj));
            if (mapValueSamples.length === 0) return 'map[string]any';
            return `map[string]${inferGoTypeFromSamples(mapValueSamples, getMapValueTypeName(key))}`;
        }

        return getStructName(key);
    };

    const inferGoTypeFromSamples = (samples: any[], key: string): string => {
        const nonNullSamples = samples.filter((value) => value !== null && value !== undefined);
        if (nonNullSamples.length === 0) return 'any';

        const arraySamples = nonNullSamples.filter(Array.isArray);
        const objectSamples = nonNullSamples.filter(isPlainObject);
        const primitiveSamples = nonNullSamples.filter((value) => !Array.isArray(value) && !isPlainObject(value));

        if (
            (arraySamples.length > 0 && (objectSamples.length > 0 || primitiveSamples.length > 0)) ||
            (objectSamples.length > 0 && primitiveSamples.length > 0)
        ) {
            return 'any';
        }

        if (arraySamples.length > 0) {
            return inferArrayType(arraySamples, key);
        }

        if (objectSamples.length > 0) {
            return inferObjectTypeFromSamples(objectSamples, key);
        }

        return inferPrimitiveType(primitiveSamples);
    };

    const buildStructDefinition = (structName: string, schema: FieldSamples): string => {
        const indent = '    ';
        let structDef = `type ${structName} struct {\n`;

        for (const [key, samples] of schema.entries()) {
            const fieldName = toGoExportedName(key);
            const goType = inferGoTypeFromSamples(samples, key);
            structDef += `${indent}${fieldName} ${goType} \`json:"${key}"\`\n`;
        }

        structDef += '}\n\n';
        return structDef;
    };

    const buildStructDefinitions = (): string => {
        return [...structOrder]
            .reverse()
            .map((structName) => buildStructDefinition(structName, structSchemas.get(structName)!))
            .join('');
    };

    try {
        if (Array.isArray(obj)) {
            collectArrayElementSchemas(obj, 'Item');
            result = buildStructDefinitions() + `type Root ${inferArrayType([obj], 'Item')}`;
        } else if (isPlainObject(obj)) {
            collectObjectSchemas([obj], 'Root');
            const rootType = inferObjectTypeFromSamples([obj], 'Root');
            result = rootType === 'Root' ? buildStructDefinitions() : buildStructDefinitions() + `type Root ${rootType}`;
        } else {
            result = `type Root ${inferPrimitiveType([obj])}`;
        }
        return result.trim();
    } catch (error: any) {
        throw new JsonConvertError('CONVERT_GO_FAILED', getErrorDetail(error));
    }
};

// JSON 转 TypeScript（合并对象样本，推断 interface / type / Record / Array）
export const convertToTypeScript = (obj: any): string => {
    const commonInitialisms = new Map(
        [
            'ACL',
            'API',
            'ASCII',
            'CPU',
            'CSS',
            'DNS',
            'EOF',
            'GUID',
            'HTML',
            'HTTP',
            'HTTPS',
            'ID',
            'IP',
            'JSON',
            'LHS',
            'QPS',
            'RAM',
            'RHS',
            'RPC',
            'SLA',
            'SMTP',
            'SQL',
            'SSH',
            'TCP',
            'TLS',
            'TTL',
            'UDP',
            'UI',
            'UID',
            'UUID',
            'URI',
            'URL',
            'UTF8',
            'VM',
            'XML',
            'XMPP',
            'XSRF',
            'XSS',
        ].map((item) => [item.toLowerCase(), item] as const),
    );

    const reservedTypeScriptKeywords = new Set([
        'break',
        'case',
        'catch',
        'class',
        'const',
        'continue',
        'debugger',
        'default',
        'delete',
        'do',
        'else',
        'enum',
        'export',
        'extends',
        'false',
        'finally',
        'for',
        'function',
        'if',
        'import',
        'in',
        'instanceof',
        'new',
        'null',
        'return',
        'super',
        'switch',
        'this',
        'throw',
        'true',
        'try',
        'typeof',
        'var',
        'void',
        'while',
        'with',
        'as',
        'implements',
        'interface',
        'let',
        'package',
        'private',
        'protected',
        'public',
        'static',
        'yield',
        'any',
        'boolean',
        'constructor',
        'declare',
        'get',
        'module',
        'require',
        'number',
        'set',
        'string',
        'symbol',
        'type',
        'from',
        'of',
    ]);

    const splitTypeNameParts = (str: string): string[] => {
        return str
            .replace(/[^a-zA-Z0-9]+/g, ' ')
            .split(/\s+/)
            .filter(Boolean)
            .flatMap((part) => part.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/g) || []);
    };

    const toTypeScriptTypeName = (str: string): string => {
        const parts = splitTypeNameParts(str);
        if (parts.length === 0) {
            return 'Value';
        }

        const typeName = parts
            .map((part) => {
                const initialism = commonInitialisms.get(part.toLowerCase());
                if (initialism) {
                    return initialism;
                }
                return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
            })
            .join('');

        return /^\d/.test(typeName) ? `Type${typeName}` : typeName;
    };

    const getTypeName = (key: string): string => toTypeScriptTypeName(key);
    const getMapValueTypeName = (key: string): string => `${getTypeName(key)}Value`;
    const isPlainObject = (value: any): value is Record<string, any> => {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    };
    const isNumericKey = (key: string): boolean => /^\d+$/.test(key);
    const isUuidLikeKey = (key: string): boolean => {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key);
    };
    const isLocaleLikeKey = (key: string): boolean => {
        return /^[a-z]{2,3}(?:[-_](?:[A-Z]{2}|\d{3}|[A-Za-z]{4,8}))+$/.test(key);
    };
    const isDynamicSuffixKey = (key: string): boolean => {
        return /^(?:[a-z][a-z0-9]*[-_])+\d+$/i.test(key);
    };
    const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const commonFieldKeys = new Set([
        'id',
        'uid',
        'uuid',
        'name',
        'title',
        'type',
        'status',
        'code',
        'message',
        'msg',
        'data',
        'meta',
        'result',
        'value',
        'count',
        'total',
        'page',
        'size',
        'list',
        'items',
        'detail',
        'description',
        'desc',
        'content',
        'label',
        'key',
        'path',
        'url',
        'uri',
        'ip',
        'host',
        'port',
        'user',
        'userid',
        'username',
        'email',
        'phone',
        'mobile',
        'age',
        'gender',
        'address',
        'city',
        'province',
        'country',
        'createdat',
        'updatedat',
        'deletedat',
        'starttime',
        'endtime',
        'success',
        'error',
        'enabled',
        'disabled',
    ]);
    const isCommonFieldKey = (key: string): boolean => commonFieldKeys.has(normalizeKey(key));
    const getObjectSignature = (value: Record<string, any>): string => {
        return Object.keys(value)
            .sort()
            .map((key) => {
                const childValue = value[key];
                if (Array.isArray(childValue)) return `${key}:array`;
                if (isPlainObject(childValue)) return `${key}:object`;
                if (childValue === null) return `${key}:null`;
                return `${key}:${typeof childValue}`;
            })
            .join('|');
    };
    const getValueKind = (value: any): string => {
        if (Array.isArray(value)) {
            const elements = value.filter((item) => item !== null && item !== undefined);
            if (elements.length === 0) return 'array:any';
            const elementKinds = [...new Set(elements.map(getValueKind))].sort();
            return `array:${elementKinds.join('|')}`;
        }
        if (isPlainObject(value)) {
            return `object:${getObjectSignature(value)}`;
        }
        if (value === null) return 'null';
        return typeof value;
    };
    const isMapLikeObject = (value: Record<string, any>): boolean => {
        const keys = Object.keys(value);
        if (keys.length === 0) return false;

        const nonNullValues = Object.values(value).filter((item) => item !== null && item !== undefined);
        if (nonNullValues.length === 0) return false;

        let score = 0;

        if (keys.length <= 2) {
            score -= 1;
        } else if (keys.length <= 4) {
            score -= 2;
        } else if (keys.length >= 8) {
            score += 1;
        }

        const numericKeyCount = keys.filter(isNumericKey).length;
        const uuidKeyCount = keys.filter(isUuidLikeKey).length;
        const localeKeyCount = keys.filter(isLocaleLikeKey).length;
        const dynamicSuffixKeyCount = keys.filter(isDynamicSuffixKey).length;
        const commonFieldKeyCount = keys.filter(isCommonFieldKey).length;

        if (numericKeyCount === keys.length) score += 4;
        else if (numericKeyCount >= 2 && numericKeyCount >= Math.ceil(keys.length / 2)) score += 3;

        if (uuidKeyCount === keys.length) score += 4;
        else if (uuidKeyCount >= 2 && uuidKeyCount >= Math.ceil(keys.length / 2)) score += 3;

        if (localeKeyCount === keys.length) score += 3;
        else if (localeKeyCount >= 2 && localeKeyCount >= Math.ceil(keys.length / 2)) score += 2;

        if (dynamicSuffixKeyCount >= 2 && dynamicSuffixKeyCount >= Math.ceil(keys.length / 2)) {
            score += 2;
        }

        if (commonFieldKeyCount >= Math.ceil(keys.length * 0.6)) {
            score -= 3;
        }

        const valueKinds = [...new Set(nonNullValues.map(getValueKind))];
        if (valueKinds.length === 1) {
            if (valueKinds[0].startsWith('object:')) {
                score += 4;
            } else if (valueKinds[0].startsWith('array:')) {
                score += 3;
            } else {
                score += 3;
            }
        } else if (valueKinds.length >= 3) {
            score -= 3;
        } else {
            score -= 1;
        }

        return score >= 3;
    };

    interface TsFieldSchema {
        samples: any[];
        presentCount: number;
    }
    interface TsInterfaceSchema {
        totalCount: number;
        fields: Map<string, TsFieldSchema>;
    }

    const interfaceSchemas = new Map<string, TsInterfaceSchema>();
    const interfaceOrder: string[] = [];

    const ensureInterfaceSchema = (interfaceName: string): TsInterfaceSchema => {
        let schema = interfaceSchemas.get(interfaceName);
        if (!schema) {
            schema = {
                totalCount: 0,
                fields: new Map<string, TsFieldSchema>(),
            };
            interfaceSchemas.set(interfaceName, schema);
            interfaceOrder.push(interfaceName);
        }
        return schema;
    };

    const collectMapValueSchemas = (values: any[], key: string) => {
        const nonNullValues = values.filter((value) => value !== null && value !== undefined);
        const mapValueTypeName = getMapValueTypeName(key);

        for (const value of nonNullValues) {
            if (Array.isArray(value)) {
                collectArrayElementSchemas(value, mapValueTypeName);
            } else if (isPlainObject(value)) {
                collectObjectSchemas([value], mapValueTypeName);
            }
        }
    };

    const collectStructSchema = (value: Record<string, any>, interfaceName: string) => {
        const schema = ensureInterfaceSchema(interfaceName);
        schema.totalCount += 1;

        for (const [key, fieldValue] of Object.entries(value)) {
            const fieldSchema = schema.fields.get(key) || { samples: [], presentCount: 0 };
            fieldSchema.samples.push(fieldValue);
            fieldSchema.presentCount += 1;
            schema.fields.set(key, fieldSchema);

            if (Array.isArray(fieldValue)) {
                collectArrayElementSchemas(fieldValue, key);
            } else if (isPlainObject(fieldValue)) {
                collectObjectSchemas([fieldValue], key);
            }
        }
    };

    const collectObjectSchemas = (objects: Record<string, any>[], key: string) => {
        const objectSamples = objects.filter(isPlainObject);
        if (objectSamples.length === 0) return;

        const nonEmptyObjects = objectSamples.filter((obj) => Object.keys(obj).length > 0);
        if (nonEmptyObjects.length > 0 && nonEmptyObjects.length === objectSamples.length && nonEmptyObjects.every(isMapLikeObject)) {
            collectMapValueSchemas(
                nonEmptyObjects.flatMap((obj) => Object.values(obj)),
                key,
            );
            return;
        }

        const interfaceName = getTypeName(key);
        for (const objectValue of objectSamples) {
            collectStructSchema(objectValue, interfaceName);
        }
    };

    const collectArrayElementSchemas = (arrayValue: any[], key: string) => {
        for (const item of arrayValue) {
            if (isPlainObject(item)) {
                collectObjectSchemas([item], key);
            } else if (Array.isArray(item)) {
                collectArrayElementSchemas(item, key);
            }
        }
    };

    const inferPrimitiveType = (values: any[]): string => {
        const primitiveTypes = [
            ...new Set(
                values
                    .filter((value) => value !== null && value !== undefined)
                    .map((value) => typeof value)
                    .filter((type) => ['string', 'number', 'boolean'].includes(type)),
            ),
        ];

        if (primitiveTypes.length === 0) return 'any';

        const order = ['string', 'number', 'boolean'];
        primitiveTypes.sort((a, b) => order.indexOf(a) - order.indexOf(b));
        return primitiveTypes.join(' | ');
    };

    const inferArrayType = (arrays: any[][], key: string): string => {
        const elements = arrays.flat();
        if (elements.length === 0) return 'Array<any>';
        return `Array<${inferTypeScriptTypeFromSamples(elements, key)}>`;
    };

    const inferObjectTypeFromSamples = (objects: Record<string, any>[], key: string): string => {
        const objectSamples = objects.filter(isPlainObject);
        if (objectSamples.length === 0) return 'Record<string, any>';

        const nonEmptyObjects = objectSamples.filter((obj) => Object.keys(obj).length > 0);
        if (nonEmptyObjects.length > 0 && nonEmptyObjects.length === objectSamples.length && nonEmptyObjects.every(isMapLikeObject)) {
            const mapValueSamples = nonEmptyObjects.flatMap((obj) => Object.values(obj));
            if (mapValueSamples.length === 0) return 'Record<string, any>';
            return `Record<string, ${inferTypeScriptTypeFromSamples(mapValueSamples, getMapValueTypeName(key))}>`;
        }

        return getTypeName(key);
    };

    const inferTypeScriptTypeFromSamples = (samples: any[], key: string): string => {
        const definedSamples = samples.filter((value) => value !== undefined);
        if (definedSamples.length === 0) return 'any';

        const unionMembers: string[] = [];
        const objectSamples = definedSamples.filter(isPlainObject);
        const arraySamples = definedSamples.filter(Array.isArray);
        const primitiveSamples = definedSamples.filter((value) => value !== null && !Array.isArray(value) && !isPlainObject(value));
        const hasNull = definedSamples.some((value) => value === null);

        if (objectSamples.length > 0) {
            unionMembers.push(inferObjectTypeFromSamples(objectSamples, key));
        }
        if (arraySamples.length > 0) {
            unionMembers.push(inferArrayType(arraySamples, key));
        }
        if (primitiveSamples.length > 0) {
            unionMembers.push(inferPrimitiveType(primitiveSamples));
        }
        if (hasNull) {
            unionMembers.push('null');
        }

        const uniqueMembers = [...new Set(unionMembers)];
        return uniqueMembers.length > 0 ? uniqueMembers.join(' | ') : 'any';
    };

    const formatPropertyName = (key: string): string => {
        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) && !reservedTypeScriptKeywords.has(key)) {
            return key;
        }
        return JSON.stringify(key);
    };

    const buildInterfaceDefinition = (interfaceName: string, schema: TsInterfaceSchema, shouldExport: boolean): string => {
        const indent = '  ';
        const lines: string[] = [`${shouldExport ? 'export ' : ''}interface ${interfaceName} {`];

        for (const [key, fieldSchema] of schema.fields.entries()) {
            const optional = fieldSchema.presentCount < schema.totalCount;
            const propertyName = formatPropertyName(key);
            const tsType = inferTypeScriptTypeFromSamples(fieldSchema.samples, key);
            lines.push(`${indent}${propertyName}${optional ? '?' : ''}: ${tsType};`);
        }

        lines.push('}');
        return lines.join('\n');
    };

    const buildInterfaceDefinitions = (exportedRootName?: string): string => {
        return interfaceOrder
            .map((interfaceName) => buildInterfaceDefinition(interfaceName, interfaceSchemas.get(interfaceName)!, interfaceName === exportedRootName))
            .join('\n\n');
    };

    try {
        if (Array.isArray(obj)) {
            collectArrayElementSchemas(obj, 'Item');
            const rootType = inferArrayType([obj], 'Item');
            const interfaces = buildInterfaceDefinitions();
            return `${interfaces ? `${interfaces}\n\n` : ''}export type Root = ${rootType};`.trim();
        }

        if (isPlainObject(obj)) {
            collectObjectSchemas([obj], 'Root');
            const rootType = inferObjectTypeFromSamples([obj], 'Root');
            if (rootType === 'Root') {
                return buildInterfaceDefinitions('Root').trim();
            }
            const interfaces = buildInterfaceDefinitions();
            return `${interfaces ? `${interfaces}\n\n` : ''}export type Root = ${rootType};`.trim();
        }

        return `export type Root = ${inferTypeScriptTypeFromSamples([obj], 'Root')};`;
    } catch (error) {
        throw new JsonConvertError('CONVERT_TYPESCRIPT_FAILED', getErrorDetail(error));
    }
};

// Cookie 转 JSON
export const cookieToJSON = (cookieStr: string, indentSize: number = 2): string => {
    try {
        const trimmed = cookieStr.trim();
        if (!trimmed) {
            throw new JsonConvertError('COOKIE_INPUT_EMPTY');
        }

        // 如果整段输入本身就是合法 JSON，直接报错，避免把误贴内容静默转换成 {}。
        try {
            JSON.parse(trimmed);
            throw new JsonConvertError('COOKIE_INPUT_IS_JSON');
        } catch (jsonError) {
            if (jsonError instanceof JsonConvertError && jsonError.code === 'COOKIE_INPUT_IS_JSON') {
                throw jsonError;
            }
        }

        const setCookieAttributeKeys = new Set(['path', 'domain', 'expires', 'max-age', 'samesite', 'priority', 'secure', 'httponly', 'partitioned']);

        const parseCookieValue = (rawValue: string): string => {
            const value = rawValue.trim();
            try {
                return decodeURIComponent(value);
            } catch {
                return value;
            }
        };

        const appendCookiePair = (acc: Record<string, any>, rawKey: string, rawValue: string) => {
            const key = rawKey.trim();
            if (!key) return;
            if (setCookieAttributeKeys.has(key.toLowerCase())) return;
            acc[key] = parseCookieValue(rawValue);
        };

        const cookies = trimmed
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .reduce((acc: Record<string, any>, line) => {
                const normalizedLine = line.replace(/^(?:Cookie|Set-Cookie)\s*:\s*/i, '');
                if (!normalizedLine) return acc;

                const segments = normalizedLine
                    .split(';')
                    .map((segment) => segment.trim())
                    .filter(Boolean);

                if (segments.length === 0) return acc;

                const isSetCookieLine = /^set-cookie\s*:/i.test(line);
                if (isSetCookieLine) {
                    const firstPair = segments[0];
                    const separatorIndex = firstPair.indexOf('=');
                    if (separatorIndex <= 0) return acc;
                    appendCookiePair(acc, firstPair.slice(0, separatorIndex), firstPair.slice(separatorIndex + 1));
                    return acc;
                }

                for (const segment of segments) {
                    const separatorIndex = segment.indexOf('=');
                    if (separatorIndex <= 0) continue;
                    appendCookiePair(acc, segment.slice(0, separatorIndex), segment.slice(separatorIndex + 1));
                }
                return acc;
            }, {});

        if (Object.keys(cookies).length === 0) {
            throw new JsonConvertError('COOKIE_NO_VALID_PAIRS');
        }

        return JSON.stringify(cookies, null, indentSize);
    } catch (error: any) {
        if (error instanceof JsonConvertError) {
            throw error;
        }
        throw new JsonConvertError('COOKIE_INVALID_FORMAT', getErrorDetail(error));
    }
};
