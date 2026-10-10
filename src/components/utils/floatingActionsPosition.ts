export type DockSide = 'left' | 'right';
export interface FloatingActionsPosition {
    side: DockSide;
    ratio: number;
}

export const FLOATING_ACTIONS_STORAGE_KEY = 'json-tool-floating-actions-position-v1';
export const DEFAULT_FLOATING_ACTIONS_POSITION: FloatingActionsPosition = { side: 'right', ratio: 0.6 };
export const FLOATING_ACTIONS_VERTICAL_MARGIN = 5;
export const FLOATING_ACTIONS_HORIZONTAL_MARGIN = 10;

export function clampPosition(value: number, max: number, margin = FLOATING_ACTIONS_VERTICAL_MARGIN): number {
    return Math.max(margin, Math.min(value, Math.max(margin, max - margin)));
}

export function restoreFloatingActionsPosition(stored: string | null): FloatingActionsPosition {
    try {
        const value = JSON.parse(stored || 'null');
        if ((value?.side === 'left' || value?.side === 'right') && typeof value.ratio === 'number' && Number.isFinite(value.ratio)) {
            return { side: value.side, ratio: Math.max(0, Math.min(1, value.ratio)) };
        }
    } catch { /* An unavailable or outdated preference must not block the tool. */ }
    return { ...DEFAULT_FLOATING_ACTIONS_POSITION };
}

export function getDockedPosition(position: FloatingActionsPosition, viewportWidth: number, viewportHeight: number, width: number, height: number) {
    const travel = Math.max(0, viewportHeight - height - FLOATING_ACTIONS_VERTICAL_MARGIN * 2);
    return {
        x: position.side === 'left' ? FLOATING_ACTIONS_HORIZONTAL_MARGIN : Math.max(FLOATING_ACTIONS_HORIZONTAL_MARGIN, viewportWidth - width - FLOATING_ACTIONS_HORIZONTAL_MARGIN),
        y: FLOATING_ACTIONS_VERTICAL_MARGIN + Math.round(Math.max(0, Math.min(1, position.ratio)) * travel),
    };
}

export function getReleasedPosition(x: number, y: number, viewportWidth: number, viewportHeight: number, width: number, height: number): FloatingActionsPosition {
    const travel = Math.max(0, viewportHeight - height - FLOATING_ACTIONS_VERTICAL_MARGIN * 2);
    return {
        side: x + width / 2 < viewportWidth / 2 ? 'left' : 'right',
        ratio: travel ? Math.max(0, Math.min(1, (y - FLOATING_ACTIONS_VERTICAL_MARGIN) / travel)) : 0.6,
    };
}

// The panel grows inward from the icon's edge; its height cannot cross the viewport.
// The saved ratio always describes the collapsed icon, so opening never changes it.
export function getExpandedPosition(anchor: { x: number; y: number }, side: DockSide, viewportHeight: number, iconSize: number, panelWidth: number, panelHeight: number) {
    return {
        x: side === 'left' ? anchor.x : anchor.x + iconSize - panelWidth,
        y: clampPosition(anchor.y + (iconSize - panelHeight) / 2, viewportHeight - panelHeight),
    };
}
