import { formatWithOptionalRepair } from '../utils/jsonRepair';
import { saveRepairSnapshot } from '../utils/repairSnapshots';
import type { JsonFormatterOptions } from '../utils/jsonEngine/types';

self.onmessage = async ({ data }: MessageEvent<{ input: string; options: JsonFormatterOptions; repairEnabled: boolean }>) => {
    try {
        const result = await formatWithOptionalRepair(data.input, data.options, data.repairEnabled,
            (stage) => self.postMessage({ type: 'stage', stage }));
        let comparisonId: string | undefined;
        if (result.repaired !== undefined) {
            self.postMessage({ type: 'stage', stage: 'saving' });
            comparisonId = await saveRepairSnapshot(data.input, result.repaired, result.formatted);
        }
        // Parsed objects and intermediate repair text stay in the Worker; terminate after delivery.
        self.postMessage({ type: 'success', formatted: result.formatted, comparisonId });
    } catch (error) {
        self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
};
