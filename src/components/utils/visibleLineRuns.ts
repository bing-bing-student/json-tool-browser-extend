/** Group visible view rows into contiguous model ranges without visiting every folded region. */
export const getVisibleLineRuns = (start: number, end: number, modelLineAt: (viewLine: number) => number) => {
    const runs: { start: number; end: number }[] = [];
    for (let viewLine = start; viewLine <= end; viewLine++) {
        const modelLine = modelLineAt(viewLine);
        const previous = runs[runs.length - 1];
        if (previous && modelLine <= previous.end + 1) previous.end = modelLine;
        else runs.push({ start: modelLine, end: modelLine });
    }
    return runs;
};
