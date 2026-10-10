// Paint only the part of a logical alignment gap visible in the editor.
// A null top represents a view zone that Monaco currently hides.
export const getVisibleDiffViewZone = (top: number | null, height: number, scrollTop: number, viewportHeight: number) => {
    if (top === null || height <= 0 || viewportHeight <= 0) return null;
    const visibleTop = Math.max(0, top - scrollTop);
    const visibleBottom = Math.min(viewportHeight, top + height - scrollTop);
    return visibleBottom > visibleTop ? { top: visibleTop, height: visibleBottom - visibleTop } : null;
};
