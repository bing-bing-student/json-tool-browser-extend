import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { nextTick, ref, watch, type Ref } from 'vue';

import { replaceEditorValuePreservingUndo } from '../utils/diffMonaco';
import type { SettingsTxt } from '../utils/i18n';
import { getValueByPath, getValueByPathParts, parsePathToParts, setValueByPath } from '../utils/jsonPath';
import { sortJsonByField, sortJsonObject, type SortMethod, type SortOrder } from '../utils/jsonSort';

export type FieldSortTarget = 'input' | 'diff-left' | 'diff-right';
export type DemoPopoverPlacement = 'right-start' | 'left-start' | 'bottom-start' | 'top-start';

export interface PathSuggestion {
    value: string;
    type?: string;
}

export interface UseJsonSortSharedState {
    fieldSortDialogVisible: Ref<boolean>;
    sortRootPath: Ref<string>;
    sortFieldName: Ref<string>;
    fieldSortTarget: Ref<FieldSortTarget>;
    isDemoMode: Ref<boolean>;
    demoGuideVisible: Ref<boolean>;
    currentDemoStepData: Ref<any>;
    demoPopoverAnchor: Ref<HTMLElement | null>;
    demoPopoverPlacement: Ref<DemoPopoverPlacement>;
    demoStepsCount: Ref<number>;
    currentDemoStep: Ref<number>;
}

interface PreprocessResult {
    data: any;
    escapeMap: any;
}

export interface UseJsonSortCtx {
    settingsTxt: Ref<SettingsTxt>;
    sortMethod: Ref<SortMethod>;
    sortOrder: Ref<SortOrder>;

    getInputEditor: () => monaco.editor.IStandaloneCodeEditor | null;
    getOutputEditor: () => monaco.editor.IStandaloneCodeEditor | null;
    getDiffSideEditor: (side: 'left' | 'right') => monaco.editor.IStandaloneCodeEditor | null;
    isDiffMode: Ref<boolean>;
    enterDiffMode: () => void;
    exitDiffMode: () => Promise<void>;
    updateDiffEditorOptions: (options: monaco.editor.IEditorOptions) => void;

    ensureProcessingFeatureAvailable: () => boolean;
    showMessageSuccess: (msg: string) => void;
    showMessageError: (msg: string) => void;

    preprocessJSON: (input: string, options?: { preserveNumberLiterals?: boolean; encodingMode?: boolean }) => PreprocessResult;
    formatJsonResult: (data: any, escapeMap: any) => string;
    formatDemoResult: (data: any, originalData: any) => string;
    writeOutputJson: (content: string) => void;
    setOutputTypeJson: () => void;
    clearOutputEditor: () => void;
    clearOutputFoldingInfo: () => void;
    updateEditorHeight: (editor: monaco.editor.IStandaloneCodeEditor) => void;
    updateLineNumberWidth: (editor: monaco.editor.IStandaloneCodeEditor) => void;
    state?: Partial<UseJsonSortSharedState>;
}

export const useJsonSort = (ctx: UseJsonSortCtx) => {
    // 字段排序对话框相关状态
    const fieldSortDialogVisible = ctx.state?.fieldSortDialogVisible ?? ref(false);
    const sortRootPath = ctx.state?.sortRootPath ?? ref<string>('');
    const sortFieldName = ctx.state?.sortFieldName ?? ref<string>('');
    const fieldSortTarget = ctx.state?.fieldSortTarget ?? ref<FieldSortTarget>('input');

    // 字段排序演示相关状态
    const isDemoMode = ctx.state?.isDemoMode ?? ref(false);
    const demoGuideVisible = ctx.state?.demoGuideVisible ?? ref(false);
    const currentDemoStepData = ctx.state?.currentDemoStepData ?? ref<any>(null);
    const savedInputContent = ref<string | null>(null);
    const demoResults = ref<any>({});
    const currentDemoStep = ctx.state?.currentDemoStep ?? ref(0);
    const demoStepsCount = ctx.state?.demoStepsCount ?? ref(0);
    const demoStartedFromDiff = ref(false);
    const demoFieldSortTargetBeforeStart = ref<FieldSortTarget>('input');
    const demoData = ref(
        JSON.parse(
            '[{"id":3,"name":"Emma Davis","education":[{"university":"Stanford University","graduationYear":2010},{"university":"Columbia University","graduationYear":2015}]},{"id":1,"name":"Dylan Mullins","education":[{"university":"MIT","graduationYear":2003},{"university":"Harvard University","graduationYear":1983}]},{"id":2,"name":"Logan Boyle","education":[{"university":"Yale University","graduationYear":2000},{"university":"University of Pennsylvania","graduationYear":2020}]}]',
        ),
    );
    const demoMapData = ref(
        JSON.parse(
            '{"B":{"id":102,"key":"task-B","value":{"score":100}},"A":{"id":101,"key":"task-A","value":{"score":70}},"C":{"id":103,"key":"task-C","value":{"score":80}},"E":{"id":105,"key":"task-E","value":{"score":60}},"D":{"id":104,"key":"task-D","value":{"score":null}}}',
        ),
    );

    // 演示 Popover 锚点与定位相关状态
    const demoPopoverAnchor = ctx.state?.demoPopoverAnchor ?? ref<HTMLElement | null>(null);
    const demoPopoverPlacement = ctx.state?.demoPopoverPlacement ?? ref<DemoPopoverPlacement>('right-start');
    const demoHighlightedEl = ref<HTMLElement | null>(null);

    let lastRootPathInput = '';
    let lastFieldPathInput = '';
    let rootPathQueryContext = '';
    let fieldPathQueryContext = '';

    watch(isDemoMode, (on) => {
        const readOnly = !!on;
        try {
            ctx.getInputEditor()?.updateOptions({ readOnly });
            ctx.getOutputEditor()?.updateOptions({ readOnly });
            ctx.updateDiffEditorOptions({ readOnly });
        } catch {
            // 编辑器尚未初始化也无妨，静默忽略
        }
    });

    const resolveDemoAnchor = (selector: string | null): HTMLElement | null => {
        if (typeof window === 'undefined') return null;
        const fallback = '.editor-panel-output';
        const sel = selector || fallback;
        try {
            const el = document.querySelector<HTMLElement>(sel);
            if (el) return el;
        } catch {
            // ignore invalid selector
        }
        return document.querySelector<HTMLElement>('.json-tool-container') || document.body;
    };

    const pickPlacementForEl = (el: HTMLElement): DemoPopoverPlacement => {
        if (typeof window === 'undefined') return 'right-start';
        const rect = el.getBoundingClientRect();
        const POPOVER_WIDTH = 420;
        const POPOVER_HEIGHT_EST = 260;
        const rightSpace = window.innerWidth - rect.right;
        const leftSpace = rect.left;
        if (rightSpace >= POPOVER_WIDTH + 24) return 'right-start';
        if (leftSpace >= POPOVER_WIDTH + 24) return 'left-start';
        const bottomSpace = window.innerHeight - rect.bottom;
        if (bottomSpace >= POPOVER_HEIGHT_EST + 24) return 'bottom-start';
        return 'top-start';
    };

    const applyDemoHighlight = (el: HTMLElement | null) => {
        if (demoHighlightedEl.value && demoHighlightedEl.value !== el) {
            demoHighlightedEl.value.classList.remove('demo-highlight-target');
        }
        if (el) {
            el.classList.add('demo-highlight-target');
            demoHighlightedEl.value = el;
            try {
                el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            } catch {
                // ignore
            }
        } else {
            demoHighlightedEl.value = null;
        }
    };

    const updateDemoPopoverAnchor = (selector: string | null) => {
        const el = resolveDemoAnchor(selector);
        demoPopoverAnchor.value = el;
        if (el) {
            demoPopoverPlacement.value = pickPlacementForEl(el);
        }
        if (isDemoMode.value) {
            applyDemoHighlight(el);
        }
    };

    // 演示数据与用户数据的行数位数可能相差很大。setValue 后必须同步刷新
    // lineNumbersMinChars，再执行容器布局；只调用 layout() 不会重新计算
    // 已由业务代码显式设置的行号栏最小字符数。
    const refreshEditorAfterDemoContentChange = (editor: monaco.editor.IStandaloneCodeEditor) => {
        ctx.updateLineNumberWidth(editor);
        ctx.updateEditorHeight(editor);
    };

    const getSmartPathSuggestions = (jsonObj: any, input: string): PathSuggestion[] => {
        if (!input.trim()) {
            return getNextLevelKeys(jsonObj, '');
        }

        if (input.endsWith('[')) {
            const pathBeforeBracket = input.slice(0, -1);
            const targetValue = pathBeforeBracket ? getValueByPath(jsonObj, pathBeforeBracket) : jsonObj;
            if (Array.isArray(targetValue)) {
                return [{ value: `${pathBeforeBracket}[*]`, type: 'array-wildcard' }];
            }
            return [];
        }

        const arrayMatch = input.match(/^(.+)\[(\d*|\*?)$/);
        if (arrayMatch) {
            const pathBeforeBracket = arrayMatch[1];
            const indexPart = arrayMatch[2];
            const targetValue = getValueByPath(jsonObj, pathBeforeBracket);
            if (Array.isArray(targetValue)) {
                if (indexPart === '') {
                    return [{ value: `${pathBeforeBracket}[*]`, type: 'array-wildcard' }];
                }
                if ('*'.startsWith(indexPart)) {
                    return [{ value: `${pathBeforeBracket}[*]`, type: 'array-wildcard' }];
                }
                if (/^\d+$/.test(indexPart)) {
                    const numIndex = parseInt(indexPart, 10);
                    const suggestions = [];

                    if (numIndex < targetValue.length) {
                        suggestions.push({
                            value: `${pathBeforeBracket}[${indexPart}]`,
                            type: 'array-index',
                        });
                    }

                    if (!suggestions.some((s) => s.value === `${pathBeforeBracket}[*]`)) {
                        suggestions.push({
                            value: `${pathBeforeBracket}[*]`,
                            type: 'array-wildcard',
                        });
                    }

                    return suggestions;
                }
            }
            return [];
        }

        if (input.endsWith('.')) {
            const pathWithoutDot = input.slice(0, -1);
            if (pathWithoutDot) {
                return getNextLevelKeys(jsonObj, input);
            }
            return getNextLevelKeys(jsonObj, '');
        }

        const lastDotIndex = input.lastIndexOf('.');
        const lastBracketIndex = input.lastIndexOf(']');
        let basePath = '';
        let contextInput = input;

        if (lastBracketIndex !== -1) {
            const bracketStart = input.lastIndexOf('[', lastBracketIndex);
            if (bracketStart !== -1) {
                const beforeBracket = input.substring(0, bracketStart);
                const afterBracket = input.substring(lastBracketIndex + 1);
                if (afterBracket.startsWith('.')) {
                    basePath = input.substring(0, lastBracketIndex + 1) + '.';
                    contextInput = afterBracket.substring(1);
                } else if (afterBracket) {
                    basePath = input.substring(0, lastBracketIndex + 1);
                    contextInput = afterBracket;
                } else {
                    if (beforeBracket) {
                        basePath = '';
                        contextInput = input;
                    } else {
                        basePath = '';
                        contextInput = input;
                    }
                }
            }
        } else if (lastDotIndex !== -1) {
            basePath = input.substring(0, lastDotIndex + 1);
            contextInput = input.substring(lastDotIndex + 1);
        }

        const allSuggestions = getNextLevelKeys(jsonObj, basePath);

        if (!contextInput) {
            return allSuggestions;
        }

        return allSuggestions.filter((suggestion) => suggestion.value.toLowerCase().startsWith(contextInput.toLowerCase()));
    };

    const queryRootPaths = (queryString: string, cb: (suggestions: PathSuggestion[]) => void) => {
        rootPathQueryContext = queryString || '';
        try {
            const jsonData = ctx.getInputEditor()?.getValue() || '';
            if (!jsonData.trim()) {
                cb([]);
                return;
            }
            const jsonObj = JSON.parse(jsonData);
            const suggestions = getSmartPathSuggestions(jsonObj, queryString || '');
            cb(suggestions);
        } catch {
            cb([]);
        }
    };

    const collectKeysFromScope = (data: any, scopePath: string): string[] => {
        const keySet = new Set<string>();

        const harvestKeysFromArray = (arr: any[]) => {
            for (const item of arr) {
                if (item && typeof item === 'object' && !Array.isArray(item)) {
                    for (const k of Object.keys(item)) keySet.add(k);
                }
            }
        };

        const path = (scopePath || '').trim();
        if (!path) {
            if (Array.isArray(data)) {
                harvestKeysFromArray(data);
            } else if (data && typeof data === 'object') {
                for (const k of Object.keys(data)) keySet.add(k);
            }
        } else if (path.includes('[*]')) {
            const segments = path.split('[*]').map((s) => s.replace(/^\./, ''));

            const walk = (currentNode: any, segIndex: number): void => {
                const seg = segments[segIndex];
                const arr = seg === '' ? currentNode : getValueByPath(currentNode, seg);
                if (!Array.isArray(arr)) return;

                if (segIndex === segments.length - 1) {
                    harvestKeysFromArray(arr);
                    return;
                }
                for (const el of arr) {
                    if (el && typeof el === 'object') walk(el, segIndex + 1);
                }
            };

            walk(data, 0);
        } else {
            const target = getValueByPath(data, path);
            if (Array.isArray(target)) {
                harvestKeysFromArray(target);
            } else if (target && typeof target === 'object') {
                for (const k of Object.keys(target)) keySet.add(k);
            }
        }

        return Array.from(keySet).sort((a, b) => a.localeCompare(b));
    };

    const queryFieldPathsFromScope = (queryString: string, cb: (suggestions: PathSuggestion[]) => void) => {
        try {
            let sourceEditor: monaco.editor.IStandaloneCodeEditor | null | undefined = null;
            const target = fieldSortTarget.value;
            if (target === 'diff-left') sourceEditor = ctx.getDiffSideEditor('left');
            else if (target === 'diff-right') sourceEditor = ctx.getDiffSideEditor('right');
            else sourceEditor = ctx.getInputEditor();

            const raw = sourceEditor?.getValue?.() || '';
            if (!raw.trim()) {
                cb([]);
                return;
            }

            let jsonObj: any;
            try {
                const result = ctx.preprocessJSON(raw, { preserveNumberLiterals: true });
                jsonObj = result.data;
            } catch {
                try {
                    jsonObj = JSON.parse(raw);
                } catch {
                    cb([]);
                    return;
                }
            }

            const keys = collectKeysFromScope(jsonObj, sortRootPath.value);
            if (keys.length === 0) {
                cb([]);
                return;
            }

            const q = (queryString || '').toLowerCase();
            const filtered = (q ? keys.filter((k) => k.toLowerCase().includes(q)) : keys).map<PathSuggestion>((k) => ({
                value: k,
                type: 'key',
            }));
            cb(filtered);
        } catch {
            cb([]);
        }
    };

    const getNextLevelKeys = (jsonObj: any, contextPath: string): PathSuggestion[] => {
        const suggestions: PathSuggestion[] = [];

        if (!contextPath || !contextPath.trim()) {
            if (Array.isArray(jsonObj)) {
                suggestions.push({ value: '[*]', type: 'array-wildcard' });
                return suggestions;
            }

            if (jsonObj && typeof jsonObj === 'object' && !Array.isArray(jsonObj)) {
                for (const [key, value] of Object.entries(jsonObj)) {
                    if (Array.isArray(value)) {
                        suggestions.push({ value: key, type: 'exact' });
                        suggestions.push({ value: `${key}[*]`, type: 'array-wildcard' });
                    } else if (value && typeof value === 'object') {
                        suggestions.push({ value: key, type: 'exact' });
                    }
                }
            }
            return suggestions.sort((a, b) => a.value.localeCompare(b.value));
        }

        const trimmedPath = contextPath.trim();
        const pathToParse = trimmedPath.endsWith('.') ? trimmedPath.slice(0, -1) : trimmedPath;

        if (!pathToParse) {
            return getNextLevelKeys(jsonObj, '');
        }

        const parts = parsePathToParts(pathToParse);
        const targetValue = getValueByPathParts(jsonObj, parts);

        if (targetValue === null || targetValue === undefined) {
            return [];
        }

        const endsWithArrayAccess = /\[(\*|\d+)\]$/.test(pathToParse);

        if (Array.isArray(targetValue)) {
            if (trimmedPath.endsWith('.') && !endsWithArrayAccess) {
                return [];
            }

            if (targetValue.length > 0) {
                const firstElement = targetValue[0];
                if (firstElement && typeof firstElement === 'object' && !Array.isArray(firstElement)) {
                    for (const [key, value] of Object.entries(firstElement)) {
                        if (Array.isArray(value)) {
                            suggestions.push({ value: key, type: 'exact' });
                            suggestions.push({ value: `${key}[*]`, type: 'array-wildcard' });
                        } else if (value && typeof value === 'object') {
                            suggestions.push({ value: key, type: 'exact' });
                        }
                    }
                }
            }
        } else if (typeof targetValue === 'object') {
            for (const [key, value] of Object.entries(targetValue)) {
                if (Array.isArray(value)) {
                    suggestions.push({ value: key, type: 'exact' });
                    suggestions.push({ value: `${key}[*]`, type: 'array-wildcard' });
                } else if (value && typeof value === 'object') {
                    suggestions.push({ value: key, type: 'exact' });
                }
            }
        }

        return suggestions.sort((a, b) => a.value.localeCompare(b.value));
    };

    const getTypeLabel = (type: string): string => {
        const typeMap: Record<string, string> = {
            exact: ctx.settingsTxt.value.sortTypeExact,
            'array-wildcard': ctx.settingsTxt.value.sortTypeArrayWildcard,
            'array-index': ctx.settingsTxt.value.sortTypeArrayIndex,
            wildcard: ctx.settingsTxt.value.sortTypeWildcard,
            key: ctx.settingsTxt.value.sortTypeKey,
        };
        return typeMap[type] || type;
    };

    const handleRootPathSelect = (item: Record<string, any>) => {
        const contextInput = rootPathQueryContext || '';
        const selectedValue = item.value;

        if (contextInput === selectedValue) {
            sortRootPath.value = selectedValue;
            lastRootPathInput = selectedValue;
            return;
        }

        let newPath = selectedValue;

        if (contextInput && contextInput !== selectedValue) {
            if (selectedValue.startsWith(contextInput)) {
                newPath = selectedValue;
            } else if (contextInput.endsWith('.') || contextInput.endsWith('[')) {
                newPath = contextInput + selectedValue;
            } else if (contextInput.match(/\[\d*\]$/) || contextInput.endsWith(']')) {
                newPath = contextInput + '.' + selectedValue;
            } else {
                const lastDotIndex = contextInput.lastIndexOf('.');
                const lastBracketIndex = contextInput.lastIndexOf('[');

                if (lastDotIndex !== -1 && (lastBracketIndex === -1 || lastDotIndex > lastBracketIndex)) {
                    const basePath = contextInput.substring(0, lastDotIndex + 1);
                    newPath = basePath + selectedValue;
                } else if (lastBracketIndex !== -1) {
                    const bracketEndIndex = contextInput.indexOf(']', lastBracketIndex);
                    if (bracketEndIndex !== -1) {
                        const basePath = contextInput.substring(0, bracketEndIndex + 1);
                        newPath = basePath + '.' + selectedValue;
                    } else {
                        newPath = selectedValue;
                    }
                } else {
                    newPath = selectedValue;
                }
            }
        }

        sortRootPath.value = newPath;
        lastRootPathInput = newPath;
    };

    const handleRootPathInput = (value: string | number) => {
        const stringValue = typeof value === 'string' ? value : String(value);
        lastRootPathInput = stringValue;
        sortRootPath.value = stringValue;
    };

    const handleFieldPathSelect = (item: Record<string, any>) => {
        const contextInput = fieldPathQueryContext || '';
        const selectedValue = item.value;

        if (contextInput === selectedValue) {
            sortFieldName.value = selectedValue;
            lastFieldPathInput = selectedValue;
            return;
        }

        let newPath = selectedValue;

        if (contextInput && contextInput !== selectedValue) {
            if (selectedValue.startsWith(contextInput)) {
                newPath = selectedValue;
            } else if (contextInput.endsWith('.') || contextInput.endsWith('[')) {
                newPath = contextInput + selectedValue;
            } else if (contextInput.match(/\[\d*\]$/) || contextInput.endsWith(']')) {
                newPath = contextInput + '.' + selectedValue;
            } else {
                const lastDotIndex = contextInput.lastIndexOf('.');
                const lastBracketIndex = contextInput.lastIndexOf('[');

                if (lastDotIndex !== -1 && (lastBracketIndex === -1 || lastDotIndex > lastBracketIndex)) {
                    const basePath = contextInput.substring(0, lastDotIndex + 1);
                    newPath = basePath + selectedValue;
                } else if (lastBracketIndex !== -1) {
                    const bracketEndIndex = contextInput.indexOf(']', lastBracketIndex);
                    if (bracketEndIndex !== -1) {
                        const basePath = contextInput.substring(0, bracketEndIndex + 1);
                        newPath = basePath + '.' + selectedValue;
                    } else {
                        newPath = selectedValue;
                    }
                } else {
                    newPath = selectedValue;
                }
            }
        }

        sortFieldName.value = newPath;
        lastFieldPathInput = newPath;
    };

    const handleFieldPathInput = (value: string | number) => {
        const stringValue = typeof value === 'string' ? value : String(value);
        lastFieldPathInput = stringValue;
        sortFieldName.value = stringValue;
    };

    const handleRootPathKeydown = (event: KeyboardEvent) => {
        if (event.key === 'Enter') {
            event.preventDefault();

            const inputEditor = ctx.getInputEditor();
            if (!inputEditor?.getValue()?.trim()) {
                return;
            }

            try {
                const jsonObj = JSON.parse(inputEditor.getValue());
                const suggestions = getSmartPathSuggestions(jsonObj, lastRootPathInput);

                if (lastRootPathInput && suggestions.some((s: PathSuggestion) => s.value === lastRootPathInput)) {
                    return;
                }

                if (suggestions.length === 1) {
                    handleRootPathSelect(suggestions[0]);
                } else if (suggestions.length > 1) {
                    const exactMatch = suggestions.find((s: PathSuggestion) => s.value.toLowerCase() === lastRootPathInput.toLowerCase());
                    handleRootPathSelect(exactMatch || suggestions[0]);
                }
            } catch {
                // ignore
            }
        }
    };

    const handleFieldPathKeydown = (event: KeyboardEvent) => {
        if (event.key === 'Enter') {
            event.preventDefault();

            const inputEditor = ctx.getInputEditor();
            if (!inputEditor?.getValue()?.trim()) {
                return;
            }

            try {
                const jsonObj = JSON.parse(inputEditor.getValue());

                let dataToAnalyze = jsonObj;
                if (sortRootPath.value.trim()) {
                    dataToAnalyze = getValueByPath(jsonObj, sortRootPath.value.trim());
                    if (dataToAnalyze === undefined) {
                        return;
                    }
                }

                const suggestions = getSmartPathSuggestions(dataToAnalyze, lastFieldPathInput);

                if (lastFieldPathInput && suggestions.some((s: PathSuggestion) => s.value === lastFieldPathInput)) {
                    return;
                }

                if (suggestions.length === 1) {
                    handleFieldPathSelect(suggestions[0]);
                } else if (suggestions.length > 1) {
                    const exactMatch = suggestions.find((s: PathSuggestion) => s.value.toLowerCase() === lastFieldPathInput.toLowerCase());
                    handleFieldPathSelect(exactMatch || suggestions[0]);
                }
            } catch {
                // ignore
            }
        }
    };

    const performFieldSort = (data: any, rootPath: string, fieldName: string) => {
        const result = JSON.parse(JSON.stringify(data));
        const path = (rootPath || '').trim();

        if (path && path.includes('[*]')) {
            const rawSegments = path.split('[*]');
            const segments = rawSegments.map((s) => s.replace(/^\./, ''));

            const walk = (currentNode: any, segIndex: number): void => {
                const seg = segments[segIndex];
                const arr = seg === '' ? currentNode : getValueByPath(currentNode, seg);
                if (!Array.isArray(arr)) {
                    return;
                }

                if (segIndex === segments.length - 1) {
                    const sorted = sortJsonByField(arr, fieldName, ctx.sortOrder.value);
                    if (seg === '') {
                        arr.length = 0;
                        arr.push(...sorted);
                    } else {
                        setValueByPath(currentNode, seg, sorted);
                    }
                    return;
                }

                for (const el of arr) {
                    if (el && typeof el === 'object') {
                        walk(el, segIndex + 1);
                    }
                }
            };

            walk(result, 0);
            return result;
        }

        if (path) {
            const target = getValueByPath(result, path);
            if (!Array.isArray(target)) {
                throw new Error(ctx.settingsTxt.value.msgFieldSortPathNotArray(path));
            }
            const sorted = sortJsonByField(target, fieldName, ctx.sortOrder.value);
            setValueByPath(result, path, sorted);
            return result;
        }
        return sortJsonByField(result, fieldName, ctx.sortOrder.value);
    };

    const showFieldSortDemo = async () => {
        fieldSortDialogVisible.value = false;
        demoFieldSortTargetBeforeStart.value = fieldSortTarget.value;
        demoStartedFromDiff.value = ctx.isDiffMode.value;

        if (ctx.isDiffMode.value) {
            await ctx.exitDiffMode();
            fieldSortTarget.value = 'input';
        }

        const demoJson = JSON.stringify(demoData.value, null, 2);
        const inputEditor = ctx.getInputEditor();
        if (inputEditor && savedInputContent.value === null) {
            try {
                savedInputContent.value = inputEditor.getValue() || '';
            } catch {
                savedInputContent.value = '';
            }
        }
        if (inputEditor) {
            inputEditor.setValue(demoJson);
            refreshEditorAfterDemoContentChange(inputEditor);
        }

        startDemoMode();
    };

    const startDemoMode = () => {
        isDemoMode.value = true;
        currentDemoStep.value = 0;
        demoResults.value = {};

        const inputEditor = ctx.getInputEditor();
        if (inputEditor && savedInputContent.value === null) {
            try {
                savedInputContent.value = inputEditor.getValue() || '';
            } catch {
                savedInputContent.value = '';
            }
        }

        if (inputEditor) {
            try {
                const demoJson = JSON.stringify(demoData.value, null, 2);
                inputEditor.setValue(demoJson);
                refreshEditorAfterDemoContentChange(inputEditor);
            } catch {
                // ignore
            }
        }

        sortRootPath.value = '';
        sortFieldName.value = '';
        ctx.clearOutputEditor();

        demoResults.value['id'] = performFieldSort(JSON.parse(JSON.stringify(demoData.value)), '', 'id');
        demoResults.value['education'] = performFieldSort(JSON.parse(JSON.stringify(demoData.value)), '[*].education', 'graduationYear');
        demoResults.value['map_id'] = performFieldSort(JSON.parse(JSON.stringify(demoMapData.value)), '', 'id');
        demoResults.value['map_value_score'] = performFieldSort(JSON.parse(JSON.stringify(demoMapData.value)), '', 'value.score');

        showDemoStep(0);
    };

    const setDemoParams = (rootPath: string, fieldName: string) => {
        sortRootPath.value = rootPath;
        sortFieldName.value = fieldName;
    };

    const setAndNext = (rootPath: string, fieldName: string, nextStep: number) => {
        setDemoParams(rootPath, fieldName);
        showDemoStep(nextStep);
    };

    const execAndNext = (rootPath: string, fieldName: string, nextStep: number) => {
        const dataToUse = demoData.value;
        const result = performFieldSort(JSON.parse(JSON.stringify(dataToUse)), rootPath, fieldName);
        const finalOutput = ctx.formatDemoResult(result, dataToUse);
        const outputEditor = ctx.getOutputEditor();
        if (outputEditor) {
            outputEditor.setValue(finalOutput);
            refreshEditorAfterDemoContentChange(outputEditor);
        }
        showDemoStep(nextStep);
    };

    const execAndNextMap = (rootPath: string, fieldName: string, nextStep: number) => {
        const dataToUse = demoMapData.value;
        const result = performFieldSort(JSON.parse(JSON.stringify(dataToUse)), rootPath, fieldName);
        const finalOutput = ctx.formatDemoResult(result, dataToUse);
        const outputEditor = ctx.getOutputEditor();
        if (outputEditor) {
            outputEditor.setValue(finalOutput);
            refreshEditorAfterDemoContentChange(outputEditor);
        }
        showDemoStep(nextStep);
    };

    const loadDemoMapNoAdvance = () => {
        const inputEditor = ctx.getInputEditor();
        if (inputEditor) {
            const demoJson = JSON.stringify(demoMapData.value, null, 2);
            inputEditor.setValue(demoJson);
            refreshEditorAfterDemoContentChange(inputEditor);
        }
        demoResults.value['map_id'] = performFieldSort(JSON.parse(JSON.stringify(demoMapData.value)), '', 'id');
        demoResults.value['map_value_score'] = performFieldSort(JSON.parse(JSON.stringify(demoMapData.value)), '', 'value.score');
    };

    const showDemoStep: (step: number) => void = (step: number) => {
        currentDemoStep.value = step;

        const steps = [
            {
                title: ctx.settingsTxt.value.demoStartTitle,
                content: ctx.settingsTxt.value.demoStartContent,
                highlight: '.editor-panel-input',
                buttons: [{ text: ctx.settingsTxt.value.demoStartButton, action: () => showDemoStep(1) }],
            },
            {
                title: ctx.settingsTxt.value.demoArrayIdTitle,
                content: ctx.settingsTxt.value.demoArrayIdContent,
                highlight: '.editor-panel-input',
                buttons: [
                    { text: ctx.settingsTxt.value.demoPrev, action: () => showDemoStep(0) },
                    { text: ctx.settingsTxt.value.demoSetParams, action: () => setAndNext('', 'id', 2) },
                ],
            },
            {
                title: ctx.settingsTxt.value.demoExecuteTitle,
                content: ctx.settingsTxt.value.demoExecuteContent,
                highlight: '.editor-panel-input',
                buttons: [
                    { text: ctx.settingsTxt.value.demoPrev, action: () => showDemoStep(1) },
                    { text: ctx.settingsTxt.value.demoExecuteSort, action: () => execAndNext('', 'id', 3) },
                ],
            },
            {
                title: ctx.settingsTxt.value.demoSortDoneTitle,
                content: ctx.settingsTxt.value.demoSortDoneContent,
                highlight: null,
                buttons: [
                    { text: ctx.settingsTxt.value.demoPrev, action: () => showDemoStep(2) },
                    { text: ctx.settingsTxt.value.demoNextExample, action: () => showDemoStep(4) },
                ],
            },
            {
                title: ctx.settingsTxt.value.demoArrayEducationTitle,
                content: ctx.settingsTxt.value.demoArrayEducationContent,
                highlight: '.editor-panel-input',
                buttons: [
                    { text: ctx.settingsTxt.value.demoPrev, action: () => showDemoStep(3) },
                    {
                        text: ctx.settingsTxt.value.demoSetParams,
                        action: () => setAndNext('[*].education', 'graduationYear', 5),
                    },
                ],
            },
            {
                title: ctx.settingsTxt.value.demoExecuteTitle,
                content: ctx.settingsTxt.value.demoExecuteContent,
                highlight: '.editor-panel-input',
                buttons: [
                    { text: ctx.settingsTxt.value.demoPrev, action: () => showDemoStep(4) },
                    {
                        text: ctx.settingsTxt.value.demoExecuteSort,
                        action: () => execAndNext('[*].education', 'graduationYear', 6),
                    },
                ],
            },
            {
                title: ctx.settingsTxt.value.demoSortDoneEducationTitle,
                content: ctx.settingsTxt.value.demoSortDoneEducationContent,
                highlight: null,
                buttons: [
                    { text: ctx.settingsTxt.value.demoPrev, action: () => showDemoStep(5) },
                    { text: ctx.settingsTxt.value.demoNextExample, action: () => showDemoStep(7) },
                ],
            },
            {
                title: ctx.settingsTxt.value.demoMapIdTitle,
                content: ctx.settingsTxt.value.demoMapIdContent,
                highlight: '.editor-panel-input',
                buttons: [
                    { text: ctx.settingsTxt.value.demoPrev, action: () => showDemoStep(6) },
                    { text: ctx.settingsTxt.value.demoSetParams, action: () => setAndNext('', 'id', 8) },
                ],
            },
            {
                title: ctx.settingsTxt.value.demoExecuteTitle,
                content: ctx.settingsTxt.value.demoMapExecuteContent,
                highlight: '.editor-panel-input',
                buttons: [
                    { text: ctx.settingsTxt.value.demoPrev, action: () => showDemoStep(7) },
                    { text: ctx.settingsTxt.value.demoExecuteSort, action: () => execAndNextMap('', 'id', 9) },
                ],
            },
            {
                title: ctx.settingsTxt.value.demoMapIdDoneTitle,
                content: ctx.settingsTxt.value.demoMapIdDoneContent,
                highlight: null,
                buttons: [
                    { text: ctx.settingsTxt.value.demoPrev, action: () => showDemoStep(8) },
                    { text: ctx.settingsTxt.value.demoNextExample, action: () => showDemoStep(10) },
                ],
            },
            {
                title: ctx.settingsTxt.value.demoMapScoreTitle,
                content: ctx.settingsTxt.value.demoMapScoreContent,
                highlight: '.editor-panel-input',
                buttons: [
                    { text: ctx.settingsTxt.value.demoPrev, action: () => showDemoStep(9) },
                    { text: ctx.settingsTxt.value.demoSetParams, action: () => setAndNext('', 'value.score', 11) },
                ],
            },
            {
                title: ctx.settingsTxt.value.demoExecuteTitle,
                content: ctx.settingsTxt.value.demoMapScoreExecuteContent,
                highlight: '.editor-panel-input',
                buttons: [
                    { text: ctx.settingsTxt.value.demoPrev, action: () => showDemoStep(10) },
                    {
                        text: ctx.settingsTxt.value.demoExecuteSort,
                        action: () => execAndNextMap('', 'value.score', 12),
                    },
                ],
            },
            {
                title: ctx.settingsTxt.value.demoMapScoreDoneTitle,
                content: ctx.settingsTxt.value.demoMapScoreDoneContent,
                highlight: null,
                buttons: [
                    { text: ctx.settingsTxt.value.demoTryAgain, action: () => startDemoMode() },
                    { text: ctx.settingsTxt.value.demoEnd, action: () => endDemoMode() },
                ],
            },
        ];
        demoStepsCount.value = steps.length;

        if (step < steps.length) {
            currentDemoStepData.value = steps[step];
            demoGuideVisible.value = true;
            nextTick(() => {
                updateDemoPopoverAnchor(steps[step].highlight);
            });
        }

        if ([1, 4, 7, 10].includes(step)) {
            sortRootPath.value = '';
            sortFieldName.value = '';
            ctx.clearOutputEditor();
        }
        if (step === 7 || step === 10) {
            loadDemoMapNoAdvance();
        }
    };

    const endDemoMode = () => {
        isDemoMode.value = false;
        demoGuideVisible.value = false;
        currentDemoStepData.value = null;
        demoPopoverAnchor.value = null;
        applyDemoHighlight(null);

        const inputEditor = ctx.getInputEditor();
        if (inputEditor) {
            const restored = savedInputContent.value !== null ? savedInputContent.value : '';
            inputEditor.setValue(restored);
            refreshEditorAfterDemoContentChange(inputEditor);
        }

        ctx.clearOutputEditor();
        savedInputContent.value = null;

        const shouldReturnToDiff = demoStartedFromDiff.value;
        fieldSortTarget.value = demoFieldSortTargetBeforeStart.value;
        demoStartedFromDiff.value = false;
        demoFieldSortTargetBeforeStart.value = 'input';

        if (shouldReturnToDiff) {
            ctx.enterDiffMode();
        }
    };

    const executeFieldSort = () => {
        if (!ctx.ensureProcessingFeatureAvailable()) return;
        fieldSortDialogVisible.value = false;

        const target = fieldSortTarget.value;
        const sourceEditor =
            target === 'diff-left' ? ctx.getDiffSideEditor('left') : target === 'diff-right' ? ctx.getDiffSideEditor('right') : ctx.getInputEditor();

        if (!sourceEditor) {
            ctx.showMessageError(ctx.settingsTxt.value.msgNoAvailableEditor);
            return;
        }

        const writeResult = (finalOutput: string) => {
            if (target === 'input') {
                ctx.writeOutputJson(finalOutput);
            } else {
                const side = target === 'diff-left' ? 'left' : 'right';
                replaceEditorValuePreservingUndo(sourceEditor, finalOutput, `diff-field-sort-${side}`);
            }
        };

        try {
            const value = sourceEditor.getValue() || '';
            const result = ctx.preprocessJSON(value, { preserveNumberLiterals: true });

            const rootPathTrim = sortRootPath.value.trim();
            const fieldTrim = sortFieldName.value.trim();

            let finalResult;
            try {
                finalResult = performFieldSort(result.data, rootPathTrim, fieldTrim);
            } catch (e: any) {
                ctx.showMessageError(ctx.settingsTxt.value.msgSortFail(e.message));
                return;
            }

            const finalOutput = ctx.formatJsonResult(finalResult, result.escapeMap);
            writeResult(finalOutput);

            const rootDesc = rootPathTrim ? ctx.settingsTxt.value.fieldSortPathData(rootPathTrim) : ctx.settingsTxt.value.fieldSortRootData;
            ctx.showMessageSuccess(ctx.settingsTxt.value.msgFieldSortSuccess(fieldTrim, rootDesc));
        } catch (error: any) {
            ctx.showMessageError(ctx.settingsTxt.value.msgSortFail(error.message));
        }
    };

    const applySort = () => {
        if (!ctx.ensureProcessingFeatureAvailable()) return;
        try {
            const value = ctx.getInputEditor()?.getValue() || '';

            if (!value.trim()) {
                ctx.showMessageError(ctx.settingsTxt.value.msgSortDataRequired);
                return;
            }

            if (ctx.sortMethod.value === 'field') {
                fieldSortTarget.value = 'input';
                sortRootPath.value = '';
                sortFieldName.value = '';
                fieldSortDialogVisible.value = true;
                return;
            }

            ctx.setOutputTypeJson();
            const result = ctx.preprocessJSON(value, { preserveNumberLiterals: true });
            const sorted = sortJsonObject(result.data, ctx.sortMethod.value, ctx.sortOrder.value, '');
            const outputResult = ctx.formatJsonResult(sorted, result.escapeMap);
            ctx.writeOutputJson(outputResult);

            ctx.showMessageSuccess(ctx.settingsTxt.value.msgSortFormatSuccess(ctx.settingsTxt.value.sortFormatJson));
        } catch (error: any) {
            ctx.showMessageError(ctx.settingsTxt.value.msgSortFail(error.message));
        }
    };

    const openFieldSortDialogForDiff = (side: 'left' | 'right') => {
        fieldSortTarget.value = side === 'left' ? 'diff-left' : 'diff-right';
        sortRootPath.value = '';
        sortFieldName.value = '';
        fieldSortDialogVisible.value = true;
    };

    return {
        fieldSortDialogVisible,
        sortRootPath,
        sortFieldName,
        fieldSortTarget,
        isDemoMode,
        demoGuideVisible,
        currentDemoStepData,
        demoPopoverAnchor,
        demoPopoverPlacement,
        demoStepsCount,
        currentDemoStep,
        queryRootPaths,
        queryFieldPathsFromScope,
        handleRootPathSelect,
        handleRootPathInput,
        handleRootPathKeydown,
        handleFieldPathSelect,
        handleFieldPathInput,
        handleFieldPathKeydown,
        getTypeLabel,
        showFieldSortDemo,
        executeFieldSort,
        endDemoMode,
        applySort,
        openFieldSortDialogForDiff,
    };
};

export type UseJsonSortReturn = ReturnType<typeof useJsonSort>;
