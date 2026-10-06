import { readFileSync } from 'node:fs';

const MONACO_FOLDING_REGION_LIMIT = 1_000_000;

const EDITOR_OPTIONS_MODULE = '/monaco-editor/esm/vs/editor/common/config/editorOptions.js';
const FOLDING_RANGES_MODULE = '/monaco-editor/esm/vs/editor/contrib/folding/browser/foldingRanges.js';
const MARKED_MODULE = '/monaco-editor/esm/vs/base/common/marked/marked.js';
const MISSING_MARKED_SOURCEMAP_COMMENT = '//# sourceMappingURL=marked.umd.js.map';

const EDITOR_FOLDING_LIMIT_SOURCE =
    "foldingMaximumRegions: register(new EditorIntOption(47 /* EditorOption.foldingMaximumRegions */, 'foldingMaximumRegions', 5000, 10, 65000, // limit must be less than foldingRanges MAX_FOLDING_REGIONS";
const EDITOR_FOLDING_LIMIT_REPLACEMENT = `foldingMaximumRegions: register(new EditorIntOption(47 /* EditorOption.foldingMaximumRegions */, 'foldingMaximumRegions', 5000, 10, ${MONACO_FOLDING_REGION_LIMIT},`;

const FOLDING_REGION_LIMIT_SOURCE = 'export const MAX_FOLDING_REGIONS = 0xFFFF;';
const FOLDING_REGION_LIMIT_REPLACEMENT = `export const MAX_FOLDING_REGIONS = ${MONACO_FOLDING_REGION_LIMIT};`;

const PARENT_INDEX_FIELD_SOURCE = 'this._parentsComputed = false;\n';
const PARENT_INDEX_FIELD_REPLACEMENT = 'this._parentsComputed = false;\nthis._parentIndexes = undefined;\n';

const PACKED_PARENT_INDEX_SOURCE = `
            const parentIndexes = [];
            const isInsideLast = (startLineNumber, endLineNumber) => {
                const index = parentIndexes[parentIndexes.length - 1];
                return this.getStartLineNumber(index) <= startLineNumber && this.getEndLineNumber(index) >= endLineNumber;
            };
            for (let i = 0, len = this._startIndexes.length; i < len; i++) {
                const startLineNumber = this._startIndexes[i];
                const endLineNumber = this._endIndexes[i];
                if (startLineNumber > MAX_LINE_NUMBER || endLineNumber > MAX_LINE_NUMBER) {
                    throw new Error('startLineNumber or endLineNumber must not exceed ' + MAX_LINE_NUMBER);
                }
                while (parentIndexes.length > 0 && !isInsideLast(startLineNumber, endLineNumber)) {
                    parentIndexes.pop();
                }
                const parentIndex = parentIndexes.length > 0 ? parentIndexes[parentIndexes.length - 1] : -1;
                parentIndexes.push(i);
                this._startIndexes[i] = startLineNumber + ((parentIndex & 0xFF) << 24);
                this._endIndexes[i] = endLineNumber + ((parentIndex & 0xFF00) << 16);
            }`;

const INT32_PARENT_INDEX_REPLACEMENT = `
            const parentStack = [];
            const parentIndexes = new Int32Array(this._startIndexes.length);
            parentIndexes.fill(-1);
            const isInsideLast = (startLineNumber, endLineNumber) => {
                const index = parentStack[parentStack.length - 1];
                return this.getStartLineNumber(index) <= startLineNumber && this.getEndLineNumber(index) >= endLineNumber;
            };
            for (let i = 0, len = this._startIndexes.length; i < len; i++) {
                const startLineNumber = this._startIndexes[i];
                const endLineNumber = this._endIndexes[i];
                if (startLineNumber > MAX_LINE_NUMBER || endLineNumber > MAX_LINE_NUMBER) {
                    throw new Error('startLineNumber or endLineNumber must not exceed ' + MAX_LINE_NUMBER);
                }
                while (parentStack.length > 0 && !isInsideLast(startLineNumber, endLineNumber)) {
                    parentStack.pop();
                }
                parentIndexes[i] = parentStack.length > 0 ? parentStack[parentStack.length - 1] : -1;
                parentStack.push(i);
            }
            this._parentIndexes = parentIndexes;`;

const PACKED_PARENT_LOOKUP_SOURCE = `
        const parent = ((this._startIndexes[index] & MASK_INDENT) >>> 24) + ((this._endIndexes[index] & MASK_INDENT) >>> 16);
        if (parent === MAX_FOLDING_REGIONS) {
            return -1;
        }
        return parent;`;
const INT32_PARENT_LOOKUP_REPLACEMENT = 'return this._parentIndexes?.[index] ?? -1;';

/**
 * @param {string} code
 * @param {string} search
 * @param {string} replacement
 * @param {string} moduleName
 */
const replaceRequired = (code, search, replacement, moduleName) => {
    if (!code.includes(search)) {
        throw new Error(`[monaco-large-folding] Unsupported Monaco ${moduleName} layout`);
    }
    return code.replace(search, replacement);
};

/** @param {string} id */
const getModuleId = (id) => id.split('?', 1)[0];

/** @param {string} id */
const normalizeModuleId = (id) => getModuleId(id).replaceAll('\\', '/');

/** @param {string} code */
export const patchMonacoEditorOptions = (code) =>
    replaceRequired(code, EDITOR_FOLDING_LIMIT_SOURCE, EDITOR_FOLDING_LIMIT_REPLACEMENT, 'editorOptions.js');

/** @param {string} source */
export const patchMonacoFoldingRanges = (source) => {
    let code = replaceRequired(source, FOLDING_REGION_LIMIT_SOURCE, FOLDING_REGION_LIMIT_REPLACEMENT, 'foldingRanges.js');

    code = replaceRequired(code, PARENT_INDEX_FIELD_SOURCE, PARENT_INDEX_FIELD_REPLACEMENT, 'foldingRanges.js');

    code = replaceRequired(code, PACKED_PARENT_INDEX_SOURCE, INT32_PARENT_INDEX_REPLACEMENT, 'foldingRanges.js');

    return replaceRequired(code, PACKED_PARENT_LOOKUP_SOURCE, INT32_PARENT_LOOKUP_REPLACEMENT, 'foldingRanges.js');
};

/** @returns {import('vite').Plugin} */
export const monacoLargeFoldingPlugin = () => ({
    name: 'monaco-large-folding',
    enforce: 'pre',
    /**
     * Monaco 0.52.2 发布包缺少 marked.umd.js.map。移除失效声明，避免 Vite
     * 在开发模式直接加载 Monaco ESM 源码时反复输出 ENOENT 警告。
     *
     * @param {string} id
     */
    load(id) {
        if (!normalizeModuleId(id).endsWith(MARKED_MODULE)) {
            return null;
        }

        return {
            code: readFileSync(getModuleId(id), 'utf8').replace(MISSING_MARKED_SOURCEMAP_COMMENT, ''),
            map: null,
        };
    },
    /**
     * @param {string} code
     * @param {string} id
     */
    transform(code, id) {
        const normalizedId = normalizeModuleId(id);
        if (normalizedId.endsWith(EDITOR_OPTIONS_MODULE)) {
            return {
                code: patchMonacoEditorOptions(code),
                map: null,
            };
        }
        if (normalizedId.endsWith(FOLDING_RANGES_MODULE)) {
            return {
                code: patchMonacoFoldingRanges(code),
                map: null,
            };
        }
        return null;
    },
});
