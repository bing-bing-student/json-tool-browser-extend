import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import {
    findJsonFoldingSummaryIndexAtOrBefore,
    getJsonFoldingSummaryByIndex,
    type JsonFoldingSummary,
    type JsonFoldingSummaryIndex,
} from '../utils/foldingInfo';

const FOLDING_INFO_LOOK_BEHIND_LINES = 20;
const FOLDING_INFO_VISIBLE_LINE_BUFFER = 50;
const FOLDING_INFO_SMALL_FILE_LINE_THRESHOLD = 1000;
const FOLDING_INFO_SMALL_FILE_UPDATE_DELAY_MS = 50;
const FOLDING_INFO_LARGE_FILE_UPDATE_DELAY_MS = 150;
const FOLDING_INFO_HUGE_LINE_THRESHOLD = 1000000;
const FOLDING_INFO_HUGE_SCROLL_INTERVAL_MS = 100;
const FOLDING_INFO_SCROLL_INTERVAL_MS = 50;

interface JsonFoldingInfoDisplayOptions {
    getSummaryIndex: () => JsonFoldingSummaryIndex;
    getOutputType: () => string;
    domObserverMaxLines: number;
}

interface FoldingInfoElement {
    element: HTMLElement;
    foldedElement: Element;
}

const hasInlineFoldedElement = (node: Node) => node instanceof Element && (node.classList.contains('inline-folded') || node.querySelector('.inline-folded') !== null);

export const setupJsonFoldingInfoDisplay = (editor: monaco.editor.IStandaloneCodeEditor, options: JsonFoldingInfoDisplayOptions) => {
    if (!editor) return;

    const getActiveModel = () => editor.getModel();

    const getFoldingInfo = (lineNumber: number): { lineNumber: number; summary: JsonFoldingSummary } | null => {
        const precomputedFoldingInfoIndex = options.getSummaryIndex();
        const itemIndex = findJsonFoldingSummaryIndexAtOrBefore(precomputedFoldingInfoIndex, lineNumber, FOLDING_INFO_LOOK_BEHIND_LINES);
        const summary = getJsonFoldingSummaryByIndex(precomputedFoldingInfoIndex, itemIndex);
        if (!summary) return null;
        return {
            lineNumber: precomputedFoldingInfoIndex.startLines[itemIndex],
            summary,
        };
    };

    const infoElements = new Map<number, FoldingInfoElement>();
    let isUpdateDisabled = false;
    let disableUpdateTimeout: ReturnType<typeof setTimeout> | null = null;

    const getUpdateDelay = () =>
        (getActiveModel()?.getLineCount() ?? 0) < FOLDING_INFO_SMALL_FILE_LINE_THRESHOLD
            ? FOLDING_INFO_SMALL_FILE_UPDATE_DELAY_MS
            : FOLDING_INFO_LARGE_FILE_UPDATE_DELAY_MS;

    let updateTimer: ReturnType<typeof setTimeout> | null = null;
    let immediateUpdateRafId: number | null = null;

    const clearInfoElements = () => {
        infoElements.forEach((info) => {
            if (info.element && info.element.parentNode) {
                info.element.remove();
            }
        });
        infoElements.clear();
    };

    const pruneDisconnectedInfoElements = () => {
        infoElements.forEach((info, lineNumber) => {
            const foldedMarkerRemoved = !info.foldedElement.isConnected || !info.foldedElement.classList.contains('inline-folded');
            if (!info.element.isConnected || foldedMarkerRemoved) {
                if (info.element.parentNode) info.element.remove();
                infoElements.delete(lineNumber);
            }
        });
    };

    const getVisibleLineRange = (): { start: number; end: number } | null => {
        try {
            const model = getActiveModel();
            if (!model || model.isDisposed()) {
                return null;
            }
            const visibleRanges = editor.getVisibleRanges();
            if (!visibleRanges || visibleRanges.length === 0) return null;

            let minLine = Infinity;
            let maxLine = 0;
            visibleRanges.forEach((range) => {
                if (range.startLineNumber < minLine) minLine = range.startLineNumber;
                if (range.endLineNumber > maxLine) maxLine = range.endLineNumber;
            });

            if (minLine === Infinity || maxLine === 0) return null;

            const totalLines = model.getLineCount();
            return {
                start: Math.max(1, minLine - FOLDING_INFO_VISIBLE_LINE_BUFFER),
                end: Math.min(totalLines, maxLine + FOLDING_INFO_VISIBLE_LINE_BUFFER),
            };
        } catch {
            return null;
        }
    };

    const updateFoldingInfo = () => {
        const model = getActiveModel();
        if (!model || model.isDisposed() || isUpdateDisabled) {
            return;
        }
        if (options.getOutputType() !== 'json') {
            clearInfoElements();
            return;
        }

        const visibleRange = getVisibleLineRange();
        if (!visibleRange) return;

        const editorDom = editor.getDomNode();
        if (!editorDom) return;

        const editorRect = editorDom.getBoundingClientRect();
        const editorHeight = editorRect.height;
        const viewLinesContainer = editorDom.querySelector('.view-lines') as HTMLElement | null;
        const viewLinesRect = viewLinesContainer?.getBoundingClientRect();
        const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);
        const foldedElements = editorDom.querySelectorAll('.inline-folded');
        const currentFoldedLines = new Set<number>();

        foldedElements.forEach((foldedElement) => {
            const viewLine = foldedElement.closest('.view-line') as HTMLElement | null;
            if (!viewLine) return;

            let lineNumber: number | null = null;

            try {
                const rect = viewLine.getBoundingClientRect();
                const elementTop = rect.top - editorRect.top;
                const elementBottom = rect.bottom - editorRect.top;

                if (elementBottom < -100 || elementTop > editorHeight + 100) return;

                let target = editor.getTargetAtClientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
                if (target?.position) {
                    lineNumber = target.position.lineNumber;
                }

                if (!lineNumber) {
                    const foldedRect = foldedElement.getBoundingClientRect();
                    target = editor.getTargetAtClientPoint(foldedRect.left + foldedRect.width / 2, foldedRect.top + foldedRect.height / 2);
                    if (target?.position) {
                        lineNumber = target.position.lineNumber;
                    }
                }

                if (!lineNumber && viewLinesRect) {
                    const foldedRect = foldedElement.getBoundingClientRect();
                    const elementY = foldedRect.top + foldedRect.height / 2 - viewLinesRect.top;
                    for (let line = visibleRange.start; line <= visibleRange.end; line++) {
                        try {
                            const lineTop = editor.getTopForLineNumber(line);
                            if (elementY >= lineTop && elementY < lineTop + lineHeight) {
                                lineNumber = line;
                                break;
                            }
                        } catch {
                            continue;
                        }
                    }
                }
            } catch {
                return;
            }

            if (!lineNumber || lineNumber < visibleRange.start || lineNumber > visibleRange.end) return;

            const foldingInfo = getFoldingInfo(lineNumber);
            if (!foldingInfo) return;
            lineNumber = foldingInfo.lineNumber;
            currentFoldedLines.add(lineNumber);

            const existingInfo = infoElements.get(lineNumber);
            const infoText = ` ${foldingInfo.summary.type === 'object' ? `${foldingInfo.summary.count} keys` : `${foldingInfo.summary.count} items`}`;
            if (existingInfo) {
                existingInfo.element.textContent = infoText;

                if (existingInfo.foldedElement === foldedElement && existingInfo.element.isConnected) {
                    return;
                }

                const nextParent = foldedElement.parentNode;
                if (nextParent) {
                    nextParent.insertBefore(existingInfo.element, foldedElement.nextSibling);
                    existingInfo.foldedElement = foldedElement;
                }
                return;
            }

            const infoElement = document.createElement('span');
            infoElement.className = 'folding-info-text';
            infoElement.textContent = infoText;

            const parent = foldedElement.parentNode;
            if (parent) {
                parent.insertBefore(infoElement, foldedElement.nextSibling);
            } else {
                viewLine.appendChild(infoElement);
            }
            infoElements.set(lineNumber, { element: infoElement, foldedElement });
        });

        infoElements.forEach((info, lineNumber) => {
            const isOutsideVisibleRange = lineNumber < visibleRange.start || lineNumber > visibleRange.end;
            const isFoldedElementRemoved = !currentFoldedLines.has(lineNumber);

            if (isOutsideVisibleRange || isFoldedElementRemoved) {
                if (info.element.parentNode) info.element.remove();
                infoElements.delete(lineNumber);
            }
        });
    };

    const debouncedUpdate = () => {
        const model = getActiveModel();
        if (!model || model.isDisposed() || isUpdateDisabled) {
            return;
        }
        if (updateTimer) clearTimeout(updateTimer);
        updateTimer = setTimeout(() => {
            const currentModel = getActiveModel();
            if (!isUpdateDisabled && currentModel && !currentModel.isDisposed()) {
                updateFoldingInfo();
            }
        }, getUpdateDelay());
    };

    const updateVisibleFoldingInfoIfNeeded = () => {
        const model = getActiveModel();
        if (!model || model.isDisposed() || isUpdateDisabled) {
            return;
        }
        pruneDisconnectedInfoElements();
        if (editor.getDomNode()?.querySelector('.inline-folded')) {
            updateFoldingInfo();
        }
    };

    const scheduleImmediateUpdate = () => {
        const model = getActiveModel();
        if (!model || model.isDisposed() || isUpdateDisabled) {
            return;
        }
        if (updateTimer) {
            clearTimeout(updateTimer);
            updateTimer = null;
        }
        if (immediateUpdateRafId) {
            cancelAnimationFrame(immediateUpdateRafId);
        }
        immediateUpdateRafId = requestAnimationFrame(() => {
            updateVisibleFoldingInfoIfNeeded();
            immediateUpdateRafId = requestAnimationFrame(() => {
                updateVisibleFoldingInfoIfNeeded();
                immediateUpdateRafId = null;
            });
        });
    };

    const disableUpdate = (duration: number = 5000) => {
        isUpdateDisabled = true;
        if (disableUpdateTimeout) clearTimeout(disableUpdateTimeout);
        disableUpdateTimeout = setTimeout(() => {
            const model = getActiveModel();
            if (!model || model.isDisposed()) {
                return;
            }
            isUpdateDisabled = false;
            setTimeout(() => {
                const currentModel = getActiveModel();
                if (!isUpdateDisabled && currentModel && !currentModel.isDisposed()) {
                    updateFoldingInfo();
                }
            }, 300);
        }, duration);
    };

    const enableUpdateAndRefresh = () => {
        const model = getActiveModel();
        if (!model || model.isDisposed()) {
            return;
        }
        if (disableUpdateTimeout) {
            clearTimeout(disableUpdateTimeout);
            disableUpdateTimeout = null;
        }
        isUpdateDisabled = false;
        if (updateTimer) {
            clearTimeout(updateTimer);
            updateTimer = null;
        }
        setTimeout(() => {
            const currentModel = getActiveModel();
            if (!isUpdateDisabled && currentModel && !currentModel.isDisposed()) {
                updateFoldingInfo();
            }
        }, getUpdateDelay());
    };

    const editorDom = editor.getContainerDomNode();
    let foldingDomObserver: MutationObserver | null = null;
    let isFoldingDomObserverActive = false;

    const syncFoldingDomObserverState = () => {
        if (!editorDom) return;
        const model = getActiveModel();
        if (!model || model.isDisposed()) {
            if (isFoldingDomObserverActive) {
                foldingDomObserver?.disconnect();
                isFoldingDomObserverActive = false;
            }
            return;
        }
        const shouldObserve = !model.isDisposed() && model.getLineCount() <= options.domObserverMaxLines;

        if (shouldObserve && !isFoldingDomObserverActive) {
            if (!foldingDomObserver) {
                foldingDomObserver = new MutationObserver((mutations) => {
                    const hasFoldingChange = mutations.some((mutation) => {
                        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                            const target = mutation.target as Element;
                            return (
                                target.classList.contains('inline-folded') ||
                                mutation.oldValue?.includes('inline-folded') ||
                                target.querySelector('.inline-folded') !== null
                            );
                        }
                        if (mutation.type === 'childList') {
                            return Array.from(mutation.addedNodes).some(hasInlineFoldedElement) || Array.from(mutation.removedNodes).some(hasInlineFoldedElement);
                        }
                        return false;
                    });

                    if (hasFoldingChange) {
                        pruneDisconnectedInfoElements();
                        scheduleImmediateUpdate();
                    }
                });
            }
            foldingDomObserver.observe(editorDom, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class'],
                attributeOldValue: true,
            });
            isFoldingDomObserverActive = true;
            return;
        }

        if (!shouldObserve && isFoldingDomObserverActive) {
            foldingDomObserver?.disconnect();
            isFoldingDomObserverActive = false;
        }
    };

    editor.onDidChangeModelContent(() => {
        syncFoldingDomObserverState();
        clearInfoElements();
        debouncedUpdate();
    });

    editor.onDidChangeModel(() => {
        clearInfoElements();
        syncFoldingDomObserverState();
        debouncedUpdate();
    });

    editor.onDidFocusEditorText(() => {
        scheduleImmediateUpdate();
    });

    syncFoldingDomObserverState();

    editorDom?.addEventListener(
        'click',
        (e) => {
            const model = getActiveModel();
            if (!model || model.isDisposed()) {
                return;
            }
            const target = e.target as Element;
            const isFoldingClick = target.closest('.folding') || target.closest('.inline-folded');
            if (isFoldingClick) {
                scheduleImmediateUpdate();
            }
        },
        true,
    );

    let scrollRafId: number | null = null;
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    let lastUpdateTime = 0;
    const getScrollUpdateInterval = () =>
        (getActiveModel()?.getLineCount() ?? 0) >= FOLDING_INFO_HUGE_LINE_THRESHOLD ? FOLDING_INFO_HUGE_SCROLL_INTERVAL_MS : FOLDING_INFO_SCROLL_INTERVAL_MS;

    editor.onDidScrollChange(() => {
        const model = getActiveModel();
        if (!model || model.isDisposed() || isUpdateDisabled) {
            return;
        }

        const now = Date.now();
        const scrollUpdateInterval = getScrollUpdateInterval();

        if (now - lastUpdateTime >= scrollUpdateInterval) {
            if (scrollRafId) cancelAnimationFrame(scrollRafId);
            scrollRafId = requestAnimationFrame(() => {
                const currentModel = getActiveModel();
                if (!isUpdateDisabled && currentModel && !currentModel.isDisposed()) {
                    updateFoldingInfo();
                    lastUpdateTime = Date.now();
                }
                scrollRafId = null;
            });
        } else if (!scrollRafId) {
            scrollRafId = requestAnimationFrame(() => {
                const checkTime = Date.now();
                const currentModel = getActiveModel();
                if (checkTime - lastUpdateTime >= scrollUpdateInterval && !isUpdateDisabled && currentModel && !currentModel.isDisposed()) {
                    updateFoldingInfo();
                    lastUpdateTime = checkTime;
                }
                scrollRafId = null;
            });
        }

        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
            const currentModel = getActiveModel();
            if (!currentModel || currentModel.isDisposed()) {
                return;
            }
            if (scrollRafId) cancelAnimationFrame(scrollRafId);
            scrollRafId = requestAnimationFrame(() => {
                const nextModel = getActiveModel();
                if (!isUpdateDisabled && nextModel && !nextModel.isDisposed()) {
                    updateFoldingInfo();
                    lastUpdateTime = Date.now();
                }
                scrollRafId = null;
            });
        }, FOLDING_INFO_LARGE_FILE_UPDATE_DELAY_MS);
    });

    setTimeout(() => {
        updateFoldingInfo();
    }, 500);

    editor.onDidChangeHiddenAreas(() => {
        scheduleImmediateUpdate();
    });

    (editor as any).__disableFoldingInfoUpdate = disableUpdate;
    (editor as any).__enableFoldingInfoUpdateAndRefresh = enableUpdateAndRefresh;
    (editor as any).__clearFoldingInfoElements = clearInfoElements;
};
