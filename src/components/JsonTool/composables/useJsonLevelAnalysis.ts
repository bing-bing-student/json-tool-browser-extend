import type { Ref } from 'vue';
import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import JsonLevelAnalysisWorker from '../workers/jsonLevelAnalysis.worker?worker';
import { getDefaultFoldLevel } from './useJsonFoldingLevels';
import { type EditorContentLanguage, detectInputLanguage } from '../utils/common';
import { calculateMaxLevel } from '../utils/jsonStructure';

const INLINE_LEVEL_ANALYSIS_MAX_CHARS = 10 * 1024 * 1024;
const LEVEL_ANALYSIS_DEBOUNCE_MS = 800;

interface JsonLevelAnalysisWorkerResponse {
    id: number;
    level?: number;
    error?: string;
}

interface UseJsonLevelAnalysisOptions {
    maxLevel: Ref<number>;
    selectedLevel: Ref<number>;
    inputContentLanguage: Ref<EditorContentLanguage>;
    getInputEditor: () => monaco.editor.IStandaloneCodeEditor | null;
    getOutputEditor: () => monaco.editor.IStandaloneCodeEditor | null;
    updateInputEditorConfig: (language: EditorContentLanguage) => void;
    preprocessJson: (input: string) => unknown;
    resetPrecomputedFoldingInfo: () => void;
    clearOutputFoldingInfo: () => void;
    clearOutputEditor: () => void;
    showDepthLimitError: () => void;
}

/**
 * 管理输入 JSON 的层级分析调度、Worker 生命周期和层级状态。
 * options 提供编辑器访问器、解析函数与状态回调；返回值用于安排、取消及销毁分析任务。
 */
export const useJsonLevelAnalysis = (options: UseJsonLevelAnalysisOptions) => {
    let worker: Worker | null = null;
    let timer: number | null = null;
    let requestId = 0;
    let workerRunning = false;

    const getModelSampleValue = (
        model: monaco.editor.ITextModel,
        maxLines: number = 80,
        maxChars: number = 20000,
    ): string => {
        const lineCount = Math.min(model.getLineCount(), maxLines);
        let sample = '';
        for (let line = 1; line <= lineCount && sample.length < maxChars; line++) {
            if (line > 1) sample += '\n';
            sample += model.getLineContent(line);
        }
        return sample.slice(0, maxChars);
    };

    /** 取消当前防抖任务和正在运行的 Worker；无输入参数，也不返回结果。 */
    const cancelPendingLevelAnalysis = () => {
        requestId++;
        if (timer !== null) {
            window.clearTimeout(timer);
            timer = null;
        }
        if (workerRunning && worker) {
            worker.terminate();
            worker = null;
            workerRunning = false;
        }
    };

    const applyLevelAnalysisResult = (level: number) => {
        if (level > 99) {
            options.showDepthLimitError();
            options.maxLevel.value = 0;
            options.selectedLevel.value = 0;
            window.setTimeout(() => {
                const inputEditor = options.getInputEditor();
                const model = inputEditor?.getModel();
                if (inputEditor && model) {
                    const fullRange = model.getFullModelRange();
                    if (!fullRange.isEmpty()) {
                        inputEditor.executeEdits('clear-input-depth-limit', [{ range: fullRange, text: '' }]);
                    }
                }
                if (options.getOutputEditor()) {
                    options.clearOutputFoldingInfo();
                    options.clearOutputEditor();
                }
            }, 100);
            return;
        }

        options.maxLevel.value = level;
        if (level > 0 && options.selectedLevel.value === 0) {
            options.selectedLevel.value = getDefaultFoldLevel(level);
        }
    };

    const resetLevelAnalysisState = (clearOutput: boolean = false) => {
        options.maxLevel.value = 0;
        options.selectedLevel.value = 0;
        if (!clearOutput) return;
        options.resetPrecomputedFoldingInfo();
        options.clearOutputEditor();
    };

    const getWorker = () => {
        if (!worker) {
            worker = new JsonLevelAnalysisWorker();
            worker.onmessage = (event: MessageEvent<JsonLevelAnalysisWorkerResponse>) => {
                const { id, level, error } = event.data;
                if (id === requestId) workerRunning = false;
                if (id !== requestId) return;
                if (error || typeof level !== 'number') {
                    resetLevelAnalysisState();
                    return;
                }
                applyLevelAnalysisResult(level);
            };
        }
        return worker;
    };

    /** 终止并释放层级分析 Worker；无输入参数，也不返回结果。 */
    const destroyLevelAnalysisWorker = () => {
        cancelPendingLevelAnalysis();
        worker?.terminate();
        worker = null;
        workerRunning = false;
    };

    /**
     * 根据输入模型是否有内容安排一次层级分析。
     * hasModelContent 表示 Monaco 模型是否非空；函数只更新层级状态，不返回结果。
     */
    const scheduleInputLevelAnalysis = (hasModelContent: boolean) => {
        cancelPendingLevelAnalysis();

        if (!hasModelContent) {
            resetLevelAnalysisState(true);
            return;
        }

        const inputEditor = options.getInputEditor();
        const modelLength = inputEditor?.getModel()?.getValueLength() ?? 0;
        const shouldUseWorker = modelLength > INLINE_LEVEL_ANALYSIS_MAX_CHARS;
        const currentRequestId = requestId;
        const delay = shouldUseWorker ? LEVEL_ANALYSIS_DEBOUNCE_MS : 0;

        timer = window.setTimeout(() => {
            timer = null;
            if (currentRequestId !== requestId) return;

            const model = options.getInputEditor()?.getModel();
            const languageSample = model ? getModelSampleValue(model) : '';
            if (!languageSample.trim() && (model?.getValueLength() ?? 0) === 0) {
                resetLevelAnalysisState(true);
                return;
            }

            const detectedLanguage = detectInputLanguage(languageSample);
            if (detectedLanguage !== options.inputContentLanguage.value) {
                options.updateInputEditorConfig(detectedLanguage);
            }
            if (detectedLanguage !== 'json') {
                resetLevelAnalysisState();
                return;
            }

            const value = options.getInputEditor()?.getValue() ?? '';
            if (!value) {
                resetLevelAnalysisState(true);
                return;
            }

            if (shouldUseWorker) {
                workerRunning = true;
                getWorker().postMessage({ id: currentRequestId, input: value });
                return;
            }

            try {
                const cleanedContent = value.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u0019]+/g, '');
                applyLevelAnalysisResult(calculateMaxLevel(options.preprocessJson(cleanedContent)));
            } catch {
                resetLevelAnalysisState();
            }
        }, delay);
    };

    return {
        cancelPendingLevelAnalysis,
        destroyLevelAnalysisWorker,
        scheduleInputLevelAnalysis,
    };
};
