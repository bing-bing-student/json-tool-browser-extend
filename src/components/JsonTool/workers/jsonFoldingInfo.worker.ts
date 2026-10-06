import { buildJsonFoldingSummaryIndex } from '../utils/foldingInfo';

interface FoldingInfoRequest {
    id: number;
    input: string;
}

interface FoldingInfoResponse {
    id: number;
    startLines?: Uint32Array;
    counts?: Uint32Array;
    types?: Uint8Array;
    error?: string;
}

self.onmessage = (event: MessageEvent<FoldingInfoRequest>) => {
    const { id, input } = event.data;
    try {
        const index = buildJsonFoldingSummaryIndex(input);
        self.postMessage(
            {
                id,
                startLines: index.startLines,
                counts: index.counts,
                types: index.types,
            } satisfies FoldingInfoResponse,
            [index.startLines.buffer, index.counts.buffer, index.types.buffer],
        );
    } catch (error: any) {
        self.postMessage({ id, error: error?.message ?? String(error) } satisfies FoldingInfoResponse);
    }
};
