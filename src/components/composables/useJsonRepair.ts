import { onBeforeUnmount, ref } from 'vue';
import { startFormatTask, type FormatTask } from '../utils/formatWorkerClient';
import type { JsonFormatterOptions } from '../utils/jsonEngine/types';
import type { FormatStage } from '../utils/jsonRepair';

export function useJsonRepair(createTask: typeof startFormatTask = startFormatTask) {
    const busy = ref(false);
    const repairing = ref(false);
    const showLoading = ref(false);
    const stage = ref<FormatStage>('parsing');
    const comparisonId = ref('');
    let task: FormatTask | undefined;
    let requestId = 0;
    let progressTimer: ReturnType<typeof setTimeout> | undefined;
    function clearRepairState() {
        clearTimeout(progressTimer);
        progressTimer = undefined;
        repairing.value = false;
        showLoading.value = false;
    }
    function cancel() { requestId++; task?.cancel(); task = undefined; busy.value = false; clearRepairState(); }
    async function format(input: string, options: JsonFormatterOptions, repairEnabled: boolean) {
        cancel();
        const id = ++requestId;
        busy.value = true;
        stage.value = 'parsing';
        try {
            task = createTask(input, options, repairEnabled, (next) => {
                if (id !== requestId) return;
                stage.value = next;
                // Only a failed compatible parse can enter repair. Keep this state through reparse/format/save.
                if (repairEnabled && next === 'repairing' && !repairing.value) {
                    repairing.value = true;
                    progressTimer = setTimeout(() => {
                        progressTimer = undefined;
                        if (id === requestId && busy.value) showLoading.value = true;
                    }, 300);
                }
            });
            const result = await task.promise;
            if (id !== requestId) return;
            comparisonId.value = result.comparisonId || '';
            return result;
        } finally {
            if (id === requestId) { task = undefined; busy.value = false; clearRepairState(); }
        }
    }
    onBeforeUnmount(cancel);
    return { busy, repairing, showLoading, stage, comparisonId, format, cancel };
}
