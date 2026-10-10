import type { FormatStage } from './jsonRepair';
import type { JsonFormatterOptions } from './jsonEngine/types';
export interface FormatWorkerResult { formatted: string; comparisonId?: string }
export interface FormatTask { promise: Promise<FormatWorkerResult>; cancel: () => void }
// Factory injection also allows testing real cancellation/stale delivery without a browser.
export function startFormatTask(
    input: string, options: JsonFormatterOptions, repairEnabled: boolean,
    onStage: (stage: FormatStage) => void,
    createWorker: () => Worker = () => new Worker(new URL('../workers/jsonFormat.worker.ts', import.meta.url), { type: 'module' }),
): FormatTask {
    let worker: Worker | undefined;
    let settled = false;
    let rejectTask: (error: Error) => void;
    const finish = () => { settled = true; worker?.terminate(); };
    const promise = new Promise<FormatWorkerResult>((resolve, reject) => {
        rejectTask = reject;
        try {
            worker = createWorker();
            worker.onmessage = ({ data }) => {
                if (settled) return;
                if (data.type === 'stage') { onStage(data.stage); return; }
                finish();
                if (data.type === 'success') resolve({ formatted: data.formatted, comparisonId: data.comparisonId });
                else reject(new Error(data.message || 'JSON processing failed'));
            };
            worker.onerror = (event) => { if (!settled) { finish(); reject(new Error(event.message || 'JSON worker failed')); } };
            worker.onmessageerror = () => { if (!settled) { finish(); reject(new Error('JSON worker result could not be read')); } };
            worker.postMessage({ input, options, repairEnabled });
        } catch (error) { finish(); reject(error); }
    });
    return { promise, cancel: () => { if (!settled) { finish(); const error = new Error('Cancelled'); error.name = 'AbortError'; rejectTask(error); } } };
}
