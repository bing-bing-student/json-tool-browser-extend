import type { Ref } from 'vue';
import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import JsonLevelAnalysisWorker from '../workers/jsonLevelAnalysis.worker?worker';
import { getDefaultFoldLevel } from './useJsonFoldingLevels';
import { type EditorContentLanguage, detectInputLanguage } from '../utils/common';
import { calculateMaxLevel } from '../utils/jsonStructure';
import { cleanJsonLevelAnalysisInput, getJsonLevelAnalysisPlan, type JsonLevelAnalysisResponse } from '../utils/jsonLevelAnalysis';
import type { JsonFormatterOptions } from '../utils/jsonEngine/types';

interface UseJsonLevelAnalysisOptions {
    maxLevel: Ref<number>;
    selectedLevel: Ref<number>;
    inputContentLanguage: Ref<EditorContentLanguage>;
    getInputEditor: () => monaco.editor.IStandaloneCodeEditor | null;
    getOutputEditor: () => monaco.editor.IStandaloneCodeEditor | null;
    updateInputEditorConfig: (language: EditorContentLanguage) => void;
    preprocessJson: (input: string) => unknown;
    getParserOptions?: () => JsonFormatterOptions;
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
    let disposed = false;
    let worker: Worker | null = null;
    let timer: number | null = null;
    let depthLimitTimer: number | null = null;
    let requestId = 0;
    let workerRunning = false;
    interface AnalysisContext { id: number; model: monaco.editor.ITextModel; version: number; }
    let activeRequest: AnalysisContext | null = null;

    const isCurrent = (request: AnalysisContext) => !disposed && request.id === requestId && !request.model.isDisposed()
        && options.getInputEditor()?.getModel() === request.model && request.model.getVersionId() === request.version;

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
        if (depthLimitTimer !== null) {
            window.clearTimeout(depthLimitTimer);
            depthLimitTimer = null;
        }
        activeRequest = null;
        if (workerRunning && worker) {
            worker.terminate();
            worker = null;
            workerRunning = false;
        }
    };

    const applyLevelAnalysisResult = (level: number, request: AnalysisContext) => {
        if (!isCurrent(request)) return;
        if (level > 99) {
            options.showDepthLimitError();
            options.maxLevel.value = 0;
            options.selectedLevel.value = 0;
            depthLimitTimer = window.setTimeout(() => {
                depthLimitTimer = null;
                if (!isCurrent(request)) return;
                const inputEditor = options.getInputEditor();
                const model = request.model;
                if (inputEditor && model) {
                    const fullRange = model.getFullModelRange();
                    if (!fullRange.isEmpty()) {
                        inputEditor.executeEdits('clear-input-depth-limit', [{ range: fullRange, text: '' }]);
                    }
                }
                if (options.getInputEditor()?.getModel() === model && options.getOutputEditor()) {
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
            const ownWorker = new JsonLevelAnalysisWorker();
            worker = ownWorker;
            ownWorker.onmessage = (event: MessageEvent<JsonLevelAnalysisResponse>) => {
                if (worker !== ownWorker) return;
                const { id, level, error } = event.data;
                const request = activeRequest;
                if (!request || id !== request.id) return;
                workerRunning = false;
                activeRequest = null;
                if (!isCurrent(request)) return;
                if (error || typeof level !== 'number' || !Number.isInteger(level) || level < 0) {
                    resetLevelAnalysisState();
                    return;
                }
                applyLevelAnalysisResult(level, request);
            };
            const handleWorkerFailure = () => {
                if (worker !== ownWorker) return;
                const request = activeRequest;
                ownWorker.terminate();
                worker = null;
                workerRunning = false;
                activeRequest = null;
                if (request && isCurrent(request)) resetLevelAnalysisState();
            };
            ownWorker.onerror = handleWorkerFailure;
            ownWorker.onmessageerror = handleWorkerFailure;
        }
        return worker;
    };

    /** 终止并释放层级分析 Worker；无输入参数，也不返回结果。 */
    const destroyLevelAnalysisWorker = () => {
        disposed = true;
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
        if (disposed) return;
        cancelPendingLevelAnalysis();

        if (!hasModelContent) {
            resetLevelAnalysisState(true);
            return;
        }

        const inputEditor = options.getInputEditor();
        const model = inputEditor?.getModel();
        if (!model || model.isDisposed()) return;
        const request: AnalysisContext = { id: requestId, model, version: model.getVersionId() };
        const plan = getJsonLevelAnalysisPlan(model.getValueLength(), model.getLineCount());

        timer = window.setTimeout(() => {
            timer = null;
            if (!isCurrent(request)) return;

            const languageSample = getModelSampleValue(model);
            if (!languageSample.trim() && model.getValueLength() === 0) {
                resetLevelAnalysisState(true);
                return;
            }

            const detectedLanguage = detectInputLanguage(languageSample);
            if (detectedLanguage !== options.inputContentLanguage.value) {
                options.updateInputEditorConfig(detectedLanguage);
            }
            if (!isCurrent(request)) return;
            if (detectedLanguage !== 'json') {
                resetLevelAnalysisState();
                return;
            }

            const value = model.getValue();
            if (!value) {
                resetLevelAnalysisState(true);
                return;
            }

            try {
                if (plan.useWorker) {
                    activeRequest = request;
                    workerRunning = true;
                    getWorker().postMessage({ id: request.id, input: value, mode: plan.mode, options: options.getParserOptions?.() });
                    return;
                }
                applyLevelAnalysisResult(calculateMaxLevel(options.preprocessJson(cleanJsonLevelAnalysisInput(value))), request);
            } catch {
                if (activeRequest === request) {
                    worker?.terminate();
                    worker = null;
                    workerRunning = false;
                    activeRequest = null;
                }
                if (isCurrent(request)) resetLevelAnalysisState();
            }
        }, plan.delay);
    };

    return {
        cancelPendingLevelAnalysis,
        destroyLevelAnalysisWorker,
        scheduleInputLevelAnalysis,
    };
};
