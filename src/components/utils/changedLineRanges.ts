interface TextChange {
    range: { startLineNumber: number; endLineNumber: number; startColumn: number };
    text: string;
}

/** Changed ranges in the new document, including adjacent lines that can merge after deletion. */
export const getChangedLineRanges = (changes: readonly TextChange[], lineCount: number) => {
    const ranges: { start: number; end: number }[] = [];
    let delta = 0;
    const sorted = [...changes].sort((a, b) => a.range.startLineNumber - b.range.startLineNumber || a.range.startColumn - b.range.startColumn);
    for (const change of sorted) {
        let insertedLines = 0;
        for (let i = 0; i < change.text.length; i++) {
            const code = change.text.charCodeAt(i);
            if (code === 13) { insertedLines++; if (change.text.charCodeAt(i + 1) === 10) i++; }
            else if (code === 10) insertedLines++;
        }
        const start = change.range.startLineNumber + delta;
        const range = { start: Math.max(1, start - 1), end: Math.min(lineCount, start + insertedLines + 1) };
        const previous = ranges[ranges.length - 1];
        if (previous && range.start <= previous.end + 1) previous.end = Math.max(previous.end, range.end);
        else ranges.push(range);
        delta += insertedLines - (change.range.endLineNumber - change.range.startLineNumber);
    }
    return ranges;
};
