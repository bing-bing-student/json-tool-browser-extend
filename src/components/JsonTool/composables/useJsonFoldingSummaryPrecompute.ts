import JsonFoldingInfoWorker from '../workers/jsonFoldingInfo.worker?worker';
import { buildJsonFoldingSummaryIndex, createEmptyJsonFoldingSummaryIndex, type JsonFoldingSummaryIndex } from '../utils/foldingInfo';

const FOLDING_PRECOMPUTE_MAX_CHARS = 256 * 1024 * 1024;
const FOLDING_INFO_WORKER_MIN_CHARS = 10 * 1024 * 1024;

interface FoldingInfoEditorHooks {
    __clearFoldingInfoElements?: () => void;
    __enableFoldingInfoUpdateAndRefresh?: () => void;
}

interface UseJsonFoldingSummaryPrecomputeOptions {
    getOutputEditor: () => FoldingInfoEditorHooks | null | undefined;
}

export const shouldPrecomputeJsonFoldingInfo = (charCount: number) => charCount <= FOLDING_PRECOMPUTE_MAX_CHARS;

export const getJsonFoldingInfoPrecomputeDelay = (charCount: number) => {
    if (charCount >= 128 * 1024 * 1024) return 1200;
    if (charCount >= 64 * 1024 * 1024) return 800;
    if (charCount >= FOLDING_INFO_WORKER_MIN_CHARS) return 300;
    return 0;
};

export const useJsonFoldingSummaryPrecompute = (options: UseJsonFoldingSummaryPrecomputeOptions) => {
    let foldingInfoWorker: Worker | null = null;
    let resolveFoldingInfoWorker: ((result: JsonFoldingSummaryIndex | null) => void) | null = null;
    let precomputedFoldingInfoIndex = createEmptyJsonFoldingSummaryIndex();
    let foldingInfoBuildRequestId = 0;

    const getFoldingSummaryIndex = () => precomputedFoldingInfoIndex;

    const cancelFoldingInfoWorker = () => {
        if (foldingInfoWorker) {
            foldingInfoWorker.terminate();
            foldingInfoWorker = null;
        }
        if (resolveFoldingInfoWorker) {
            resolveFoldingInfoWorker(null);
            resolveFoldingInfoWorker = null;
        }
    };

    const resetPrecomputedFoldingInfo = () => {
        foldingInfoBuildRequestId += 1;
        cancelFoldingInfoWorker();
        precomputedFoldingInfoIndex = createEmptyJsonFoldingSummaryIndex();
    };

    const clearOutputFoldingInfo = () => {
        resetPrecomputedFoldingInfo();
        options.getOutputEditor()?.__clearFoldingInfoElements?.();
    };

    const buildFoldingInfoInWorker = (formattedText: string, requestId: number): Promise<JsonFoldingSummaryIndex | null> => {
        cancelFoldingInfoWorker();

        return new Promise((resolve) => {
            resolveFoldingInfoWorker = resolve;
            const worker = new JsonFoldingInfoWorker();
            foldingInfoWorker = worker;

            const cleanup = () => {
                if (foldingInfoWorker === worker) {
                    worker.terminate();
                    foldingInfoWorker = null;
                }
                if (resolveFoldingInfoWorker === resolve) {
                    resolveFoldingInfoWorker = null;
                }
            };

            worker.onmessage = (event: MessageEvent<{ id: number; startLines?: Uint32Array; counts?: Uint32Array; types?: Uint8Array; error?: string }>) => {
                const { id, startLines, counts, types, error } = event.data;
                cleanup();

                if (id !== requestId || error || !startLines || !counts || !types) {
                    resolve(null);
                    return;
                }

                resolve({
                    startLines,
                    counts,
                    types,
                });
            };

            worker.onerror = () => {
                cleanup();
                resolve(null);
            };

            worker.postMessage({ id: requestId, input: formattedText });
        });
    };

    const precomputeFoldingInfo = async (formattedText: string, requestId: number = ++foldingInfoBuildRequestId): Promise<boolean> => {
        if (!shouldPrecomputeJsonFoldingInfo(formattedText.length)) {
            if (requestId === foldingInfoBuildRequestId) {
                precomputedFoldingInfoIndex = createEmptyJsonFoldingSummaryIndex();
            }
            return false;
        }

        const result =
            formattedText.length >= FOLDING_INFO_WORKER_MIN_CHARS ? await buildFoldingInfoInWorker(formattedText, requestId) : buildJsonFoldingSummaryIndex(formattedText);
        if (!result || requestId !== foldingInfoBuildRequestId) {
            return false;
        }

        precomputedFoldingInfoIndex = result;
        options.getOutputEditor()?.__enableFoldingInfoUpdateAndRefresh?.();
        return true;
    };

    const schedulePrecomputeFoldingInfo = (formattedText: string, delay: number = 0): Promise<boolean> => {
        const requestId = ++foldingInfoBuildRequestId;
        return new Promise((resolve) => {
            setTimeout(() => {
                if (requestId !== foldingInfoBuildRequestId) {
                    resolve(false);
                    return;
                }
                precomputeFoldingInfo(formattedText, requestId).then(resolve, () => resolve(false));
            }, delay);
        });
    };

    return {
        getFoldingSummaryIndex,
        cancelFoldingInfoWorker,
        resetPrecomputedFoldingInfo,
        clearOutputFoldingInfo,
        precomputeFoldingInfo,
        schedulePrecomputeFoldingInfo,
        shouldPrecomputeFoldingInfo: shouldPrecomputeJsonFoldingInfo,
        getFoldingInfoPrecomputeDelay: getJsonFoldingInfoPrecomputeDelay,
    };
};
