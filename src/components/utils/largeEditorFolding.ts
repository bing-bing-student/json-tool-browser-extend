/** Reuse tracked fold decorations after local edits instead of replacing every region's marker.
 * Decoration construction follows Monaco FoldingModel.updatePost (Copyright Microsoft, MIT).
 */
export const optimizeLargeEditorFolding = (folding: any) => {
    const original = folding?.updatePost;
    const provider = folding?._decorationProvider;
    const model = folding?.textModel;
    if (typeof original !== 'function' || !Array.isArray(folding._editorDecorationIds) || typeof provider?.getDecorationOption !== 'function'
        || typeof provider?.changeDecorations !== 'function' || typeof model?.getDecorationOptions !== 'function' || typeof folding._updateEventEmitter?.fire !== 'function') return;
    folding.updatePost = function (regions: any) {
        const previous = this._editorDecorationIds;
        if (previous.length !== regions.length) return original.call(this, regions);
        const changed: number[] = [];
        const removed: string[] = [];
        const decorations: any[] = [];
        let lastHidden = -1;
        for (let i = 0; i < regions.length; i++) {
            const start = regions.getStartLineNumber(i), end = regions.getEndLineNumber(i);
            const collapsed = regions.isCollapsed(i);
            const options = provider.getDecorationOption(collapsed, end <= lastHidden, regions.getSource(i) !== 0);
            const startColumn = model.getLineMaxColumn(start), endColumn = model.getLineMaxColumn(end);
            const range = model.getDecorationRange(previous[i]);
            if (!range || range.startLineNumber !== start || range.endLineNumber !== end || range.startColumn !== startColumn || range.endColumn !== endColumn
                || model.getDecorationOptions(previous[i]) !== options) {
                changed.push(i);
                removed.push(previous[i]);
                decorations.push({ range: { startLineNumber: start, startColumn, endLineNumber: end, endColumn: endColumn + 1 }, options });
            }
            if (collapsed && end > lastHidden) lastHidden = end;
        }
        if (changed.length) {
            provider.changeDecorations((accessor: any) => {
                const replacements = accessor.deltaDecorations(removed, decorations);
                const ids = previous.slice();
                for (let i = 0; i < changed.length; i++) ids[changed[i]] = replacements[i];
                this._editorDecorationIds = ids;
            });
        }
        this._regions = regions;
        this._updateEventEmitter.fire({ model: this });
    };
};
