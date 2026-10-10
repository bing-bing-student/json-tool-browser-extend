import { analyzeJsonLevelInput, type JsonLevelAnalysisRequest, type JsonLevelAnalysisResponse } from '../utils/jsonLevelAnalysis';

self.onmessage = (event: MessageEvent<JsonLevelAnalysisRequest>) => {
    const { id, input, mode, options } = event.data;
    try {
        const level = analyzeJsonLevelInput(input, mode, options);
        self.postMessage({ id, level } satisfies JsonLevelAnalysisResponse);
    } catch (error: any) {
        self.postMessage({ id, error: error?.message ?? String(error) } satisfies JsonLevelAnalysisResponse);
    }
};
