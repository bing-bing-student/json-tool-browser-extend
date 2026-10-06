interface LevelAnalysisRequest {
    id: number;
    input: string;
}

interface LevelAnalysisResponse {
    id: number;
    level?: number;
    error?: string;
}

const calculateMaxLevelFromJsonLikeText = (input: string): number => {
    let level = 0;
    let maxLevel = 0;
    let inString = false;
    let stringChar = '';
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        const next = input[i + 1] || '';

        if (inLineComment) {
            if (char === '\n') inLineComment = false;
            continue;
        }

        if (inBlockComment) {
            if (char === '*' && next === '/') {
                i++;
                inBlockComment = false;
            }
            continue;
        }

        if (inString) {
            if (char === '\\' && next) {
                i++;
                continue;
            }
            if (char === stringChar) {
                inString = false;
                stringChar = '';
            }
            continue;
        }

        if (char === '/' && next === '/') {
            i++;
            inLineComment = true;
            continue;
        }

        if (char === '/' && next === '*') {
            i++;
            inBlockComment = true;
            continue;
        }

        if (char === '#') {
            inLineComment = true;
            continue;
        }

        if (char === '"' || char === "'") {
            inString = true;
            stringChar = char;
            continue;
        }

        if (char === '{' || char === '[') {
            level++;
            if (level > maxLevel) maxLevel = level;
            continue;
        }

        if (char === '}' || char === ']') {
            level--;
            if (level < 0) {
                throw new Error('JSON 结构括号不匹配');
            }
        }
    }

    if (inString) {
        throw new Error('JSON 字符串未闭合');
    }
    if (inBlockComment) {
        throw new Error('JSON 块注释未闭合');
    }
    if (level !== 0) {
        throw new Error('JSON 结构括号不匹配');
    }

    return maxLevel;
};

self.onmessage = (event: MessageEvent<LevelAnalysisRequest>) => {
    const { id, input } = event.data;
    try {
        const level = calculateMaxLevelFromJsonLikeText(input);
        self.postMessage({ id, level } satisfies LevelAnalysisResponse);
    } catch (error: any) {
        self.postMessage({ id, error: error?.message ?? String(error) } satisfies LevelAnalysisResponse);
    }
};
