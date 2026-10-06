import { computed, type Ref } from 'vue';
import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { sleep } from '../utils/common';

export interface JsonFoldingLevelFoldResult {
    firstTargetLevelLine: number | null;
    firstCollapsedLine: number | null;
    targetRegionCount: number;
}

interface UseJsonFoldingLevelsOptions {
    selectedLevel: Ref<number>;
    maxFoldableLevel: Ref<number | null>;
    getOutputEditor: () => monaco.editor.IStandaloneCodeEditor | null;
}

export const getDefaultFoldLevel = (level: number) => {
    if (level >= 2) return 2;
    if (level > 0) return 1;
    return 0;
};

export const getFoldingModelAsync = async (editor: monaco.editor.IStandaloneCodeEditor): Promise<any> => {
    const controller = (editor as any).getContribution?.('editor.contrib.folding');
    return controller?.getFoldingModel?.() ?? null;
};

const forEachFoldingRegionLevel = (regions: any, callback: (index: number, level: number) => void) => {
    const parentStack: number[] = [];

    for (let i = 0; i < regions.length; i++) {
        const startLine = regions.getStartLineNumber(i);
        while (parentStack.length > 0) {
            const parentIdx = parentStack[parentStack.length - 1];
            if (regions.getEndLineNumber(parentIdx) >= startLine) break;
            parentStack.pop();
        }
        const level = parentStack.length + 1;
        parentStack.push(i);
        callback(i, level);
    }
};

const getMaxFoldingRegionLevel = (regions: any) => {
    let maxComputedLevel = 0;
    forEachFoldingRegionLevel(regions, (_index, level) => {
        maxComputedLevel = Math.max(maxComputedLevel, level);
    });

    return maxComputedLevel;
};

export const useJsonFoldingLevels = (options: UseJsonFoldingLevelsOptions) => {
    const isFoldLevelDisabled = (level: number): boolean => {
        return options.maxFoldableLevel.value !== null && options.maxFoldableLevel.value > 0 && level > options.maxFoldableLevel.value;
    };

    const isSelectedFoldLevelDisabled = computed(() => {
        return options.selectedLevel.value > 0 && isFoldLevelDisabled(options.selectedLevel.value);
    });

    const resolveMaxFoldableLevel = async (editor: monaco.editor.IStandaloneCodeEditor | null = options.getOutputEditor()): Promise<number | null> => {
        if (!editor) return null;
        const model = editor.getModel();
        if (!model || model.getLanguageId() !== 'json') return null;

        for (let attempt = 0; attempt < 4; attempt++) {
            const foldingModel = await getFoldingModelAsync(editor);
            const regions = foldingModel?.regions;
            if (regions && regions.length > 0) {
                return getMaxFoldingRegionLevel(regions);
            }
            await sleep(150 * (attempt + 1));
        }

        return 0;
    };

    const refreshMaxFoldableLevel = async (language: string = 'json') => {
        const outputEditor = options.getOutputEditor();
        if (!outputEditor || language !== 'json') {
            options.maxFoldableLevel.value = null;
            return;
        }
        const resolvedLevel = await resolveMaxFoldableLevel(outputEditor);
        if (!options.getOutputEditor()) return;
        options.maxFoldableLevel.value = resolvedLevel;
    };

    const foldByIndentation = async (): Promise<JsonFoldingLevelFoldResult> => {
        const outputEditor = options.getOutputEditor();
        if (!outputEditor) return { firstTargetLevelLine: null, firstCollapsedLine: null, targetRegionCount: 0 };

        const model = outputEditor.getModel();
        if (!model) return { firstTargetLevelLine: null, firstCollapsedLine: null, targetRegionCount: 0 };

        const targetLevel = options.selectedLevel.value;
        const foldingModel = await getFoldingModelAsync(outputEditor);
        if (!foldingModel) return { firstTargetLevelLine: null, firstCollapsedLine: null, targetRegionCount: 0 };

        const regions = foldingModel.regions;
        if (!regions || regions.length === 0) return { firstTargetLevelLine: null, firstCollapsedLine: null, targetRegionCount: 0 };

        const toExpand: any[] = [];
        const toCollapse: any[] = [];
        let firstCollapsedLine: number | null = null;
        let firstTargetLevelLine: number | null = null;
        let targetRegionCount = 0;

        forEachFoldingRegionLevel(regions, (index, level) => {
            const region = regions.toRegion(index);
            const isCollapsed = regions.isCollapsed(index);
            const startLine = regions.getStartLineNumber(index);

            if (level === targetLevel) {
                firstTargetLevelLine = firstTargetLevelLine === null ? startLine : Math.min(firstTargetLevelLine, startLine);
                targetRegionCount++;
            }
            if (level >= targetLevel) {
                if (!isCollapsed) {
                    toCollapse.push(region);
                    firstCollapsedLine = firstCollapsedLine === null ? startLine : Math.min(firstCollapsedLine, startLine);
                }
            } else if (isCollapsed) {
                toExpand.push(region);
            }
        });

        if (toExpand.length > 0) {
            foldingModel.toggleCollapseState(toExpand);
        }
        if (toCollapse.length > 0) {
            foldingModel.toggleCollapseState(toCollapse);
        }

        return { firstTargetLevelLine, firstCollapsedLine, targetRegionCount };
    };

    return {
        isFoldLevelDisabled,
        isSelectedFoldLevelDisabled,
        resolveMaxFoldableLevel,
        refreshMaxFoldableLevel,
        foldByIndentation,
    };
};
