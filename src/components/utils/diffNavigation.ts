export interface DiffNavigationBounds {
    top: number;
    bottom: number;
}

// Include alignment spacers: a repair block may start with an inserted bracket
// before the first actual line on the original side.
export const getAlignedDiffNavigationBounds = (
    left: DiffNavigationBounds | null,
    right: DiffNavigationBounds | null,
): DiffNavigationBounds | null => {
    if (!left) return right;
    if (!right) return left;
    return { top: Math.min(left.top, right.top), bottom: Math.max(left.bottom, right.bottom) };
};

export const getDiffNavigationScrollTop = (
    bounds: DiffNavigationBounds,
    scrollTop: number,
    viewportHeight: number,
    lineHeight: number,
): number | null => {
    if (viewportHeight <= 0) return null;
    const height = bounds.bottom - bounds.top;
    const targetBottom = height > viewportHeight ? bounds.top + lineHeight : bounds.bottom;
    if (bounds.top >= scrollTop && targetBottom <= scrollTop + viewportHeight) return null;
    const center = height > viewportHeight ? bounds.top + lineHeight / 2 : (bounds.top + bounds.bottom) / 2;
    return Math.max(0, center - viewportHeight / 2);
};

export const getVisibleDiffNavigationMarker = (bounds: DiffNavigationBounds, scrollTop: number, viewportHeight: number) => {
    const top = Math.max(0, bounds.top - scrollTop);
    const bottom = Math.min(viewportHeight, bounds.bottom - scrollTop);
    return bottom > top ? { top, height: bottom - top } : null;
};
