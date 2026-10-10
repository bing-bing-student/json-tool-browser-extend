// Diff 编辑器：Monaco 双编辑器实例 + 行级 diff 可视化 + 草稿持久化
//
// 这个组合式函数承担「diff 模式下的全部 editor 生命周期」：
//   1) 创建 / 销毁 左右两个 Monaco editor 实例（基础选项）
//   2) 行级 / 行内 diff 计算、同步按钮渲染、view zones 对齐
//   3) 跳转上 / 下一个 diff、左右一键同步
//   4) 同步滚动（带重入锁）
//   5) IndexedDB diff 草稿的保存 / 恢复
//   6) 布局调度（rAF debounce）
//
// 不包含：
//   - 进入 / 退出 diff 模式的页面状态机（留在主文件，因为涉及 normal editor 的销毁/恢复）
//   - 格式化 / 排序 / 复制 / 清空 / 上传 / 下载（这些跨普通模式 + diff 模式，留在主文件，
//     主文件通过 getDiffLeftEditor / getDiffRightEditor 拿到实例后调用 utils 中的
//     replaceEditorValuePreservingUndo 完成内容替换）
//
// 主文件的 helper（trackEditorFocus / setupDoubleClickSelectString / ...）通过 options
// 注入，避免反向 import 主文件。

// Monaco 按需引入：仅引核心编辑器 API + JSON 语言贡献，避免拉入 basic-languages 全家桶。
// 与主文件 JsonTool.client.vue 保持同一入口，确保 Vite 不会因为另一个 'monaco-editor'
// 入口而合并出完整产物 chunk。
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { type Ref, ref } from 'vue';

import { calculateByteSize } from '../utils/byteUtils';
import type { DiffLineChange } from '../utils/diffEngine';
import type { DiffLocaleState } from '../utils/jsonToolLocaleTransition';
import { IDB_STORE_DIFF_DRAFTS, MAX_DIFF_SIDE_SIZE, MAX_DIFF_TAB_COUNT, idbCount, idbGet, idbPut } from '../utils/idb';
import { buildDiffViewZoneSpecs, getDiffChangeTop, layoutOneDiffEditor, replaceDiffViewZones } from '../utils/diffMonaco';
import { JSON_TOOL_EDITOR_HORIZONTAL_SCROLLBAR_THICKNESS, JSON_TOOL_EDITOR_SCROLLBAR_THICKNESS } from '../utils/editorScrollbar';
import { getJsonToolWordWrapOptions } from '../utils/editorWordWrap';
import { getAlignedDiffNavigationBounds, getDiffNavigationScrollTop, getVisibleDiffNavigationMarker, type DiffNavigationBounds } from '../utils/diffNavigation';
import { getJsonToolThemeForLanguage, type JsonToolThemeMode } from '../utils/monacoThemes';
import { ensureMonacoTextareaAttrs, type MonacoTextareaAttrObserver } from '../utils/monacoTextareaAttrs';

type DiffEngineModule = Pick<typeof import('../utils/diffEngine'), 'computeLineDiff' | 'computeInlineDiff'>;
interface RepairComparisonChanges {
    changes: DiffLineChange[];
    navigationChanges: DiffLineChange[];
}

let diffEnginePromise: Promise<DiffEngineModule> | null = null;

const loadDiffEngine = (): Promise<DiffEngineModule> => {
    if (!diffEnginePromise) {
        diffEnginePromise = import('../utils/diffEngine').then(({ computeLineDiff, computeInlineDiff }) => ({ computeLineDiff, computeInlineDiff }));
    }
    return diffEnginePromise;
};

const getDiffLineRangeInfo = (change: DiffLineChange) => {
    const hasLeft = change.originalEndLineNumber >= change.originalStartLineNumber;
    const hasRight = change.modifiedEndLineNumber >= change.modifiedStartLineNumber;
    const leftLineCount = hasLeft ? change.originalEndLineNumber - change.originalStartLineNumber + 1 : 0;
    const rightLineCount = hasRight ? change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1 : 0;
    return { hasLeft, hasRight, leftLineCount, rightLineCount };
};

interface DiffSyncButton {
    top: number;
    changeIndex: number;
}

interface DiffNavigationMarker {
    widget: monaco.editor.IOverlayWidget;
    node: HTMLElement;
    bar: HTMLElement;
    position: monaco.editor.IOverlayWidgetPositionCoordinates;
    animation: Animation | null;
}

interface DiffDraftRecord {
    tabId: string;
    leftText: string;
    rightText: string;
    updatedAt: number;
    version: number;
}

export interface UseDiffEditorsOptions {
    localeState?: DiffLocaleState;
    // DOM 容器与状态条
    leftContainerRef: Ref<HTMLElement | null>;
    rightContainerRef: Ref<HTMLElement | null>;
    leftStatusRef: Ref<string>;
    rightStatusRef: Ref<string>;

    // 标签页隔离 & 通知
    tabId: Ref<string>;
    onError: (msg: string) => void;

    // 与普通模式共享的设置项（响应式 ref）
    showMinimap: Ref<boolean>;
    fontSize: Ref<number>;
    /** wordWrap.value === true 表示用户要"不换行"，与设置开关取反语义 */
    wordWrap: Ref<boolean>;
    themeMode: Ref<JsonToolThemeMode>;

    // 主文件提供的 editor 通用工具（注入，避免反向 import 主文件）
    trackEditorFocus: (editor: monaco.editor.IStandaloneCodeEditor) => void;
    setupDoubleClickSelectString: (editor: monaco.editor.IStandaloneCodeEditor, copy: boolean) => void;
    registerClipboardActions: (editor: monaco.editor.IStandaloneCodeEditor) => void;
    registerEncodingActions: (editor: monaco.editor.IStandaloneCodeEditor) => void;
    filterBuiltinContextMenuActions: (editor: monaco.editor.IStandaloneCodeEditor, hiddenIds: string[]) => void;
    setupSelectionListener: (editor: monaco.editor.IStandaloneCodeEditor, statusRef: Ref<string>) => monaco.IDisposable[];
    updateLineNumberWidth: (editor: monaco.editor.IStandaloneCodeEditor) => void;
    /** 内容变化时计算缩进，返回 tab 大小 */
    detectIndentSize: (content: string) => number;
    /** 销毁 editor 前的钩子，让主文件清理诸如 lastFocusedEditor 的引用 */
    exactComparison?: Ref<boolean>;
    onBeforeDisposeEditor?: (editor: monaco.editor.IStandaloneCodeEditor) => void;
}

export interface UseDiffEditorsReturn {
    comparisonBusy: Ref<boolean>;
    cancelComparison: () => void;
    // 视图层使用的响应式状态
    diffCount: Ref<number>;
    activeDiffIndex: Ref<number>;
    diffSyncButtons: Ref<DiffSyncButton[]>;
    diffDraftLeftText: Ref<string>;
    diffDraftRightText: Ref<string>;

    // editor 实例的访问器
    getDiffLeftEditor: () => monaco.editor.IStandaloneCodeEditor | null;
    getDiffRightEditor: () => monaco.editor.IStandaloneCodeEditor | null;
    getDiffSideEditor: (side: 'left' | 'right') => monaco.editor.IStandaloneCodeEditor | null;
    isDiffEditorReady: () => boolean;

    // 生命周期
    createDiffEditor: () => void;
    destroyDiffEditor: () => void;

    // 调度
    scheduleDiffEditorLayout: () => void;
    scheduleDiffRecompute: () => void;

    // 计算 / 跳转 / 同步
    recomputeDiff: () => void;
    updateDiffSyncButtons: () => void;
    goToNextDiff: () => void;
    goToPrevDiff: () => void;
    revealDiffChange: (index: number) => void;
    handleDiffSync: (changeIndex: number, direction: 'left' | 'right') => void;

    // 草稿
    captureDiffDraftFromEditors: () => void;
    saveDiffDraft: (reason: string) => Promise<void>;
    loadDiffDraftSnapshot: () => Promise<void>;
    restoreDiffDraftIntoEditors: () => Promise<void>;

    // 选项透传 / 布局
    updateDiffEditorOptions: (options: monaco.editor.IEditorOptions) => void;
    layoutDiffEditors: () => void;
}

export const useDiffEditors = (opts: UseDiffEditorsOptions): UseDiffEditorsReturn => {
    let pendingLocaleState = opts.localeState;
    let skipInitialDraftRestore = Boolean(pendingLocaleState);
    opts.localeState = undefined;
    const {
        leftContainerRef,
        rightContainerRef,
        leftStatusRef,
        rightStatusRef,
        tabId,
        onError,
        showMinimap,
        fontSize,
        wordWrap,
        themeMode,
        trackEditorFocus,
        setupDoubleClickSelectString,
        registerClipboardActions,
        registerEncodingActions,
        filterBuiltinContextMenuActions,
        setupSelectionListener,
        updateLineNumberWidth,
        detectIndentSize,
        onBeforeDisposeEditor,
    } = opts;

    // ==================== 内部状态 ====================
    let diffLeftEditor: monaco.editor.IStandaloneCodeEditor | null = null;
    let diffRightEditor: monaco.editor.IStandaloneCodeEditor | null = null;

    let diffLineChanges: DiffLineChange[] = [];
    // Character alignment can split a block; counting/navigation retain the original contiguous blocks.
    let diffNavigationChanges: DiffLineChange[] = [];
    let diffLeftDecorations: string[] = [];
    let diffRightDecorations: string[] = [];
    let diffLeftViewZoneIds: string[] = [];
    let diffRightViewZoneIds: string[] = [];
    let leftNavigationMarker: DiffNavigationMarker | null = null;
    let rightNavigationMarker: DiffNavigationMarker | null = null;

    let diffSyncingScroll = false;
    let diffContentDisposables: monaco.IDisposable[] = [];
    let diffLeftResizeObserver: ResizeObserver | null = null;
    let diffRightResizeObserver: ResizeObserver | null = null;
    let diffLeftTextareaAttrObserver: MonacoTextareaAttrObserver | null = null;
    let diffRightTextareaAttrObserver: MonacoTextareaAttrObserver | null = null;
    let diffEditorLayoutRaf: number | null = null;
    let diffRecomputeRaf: number | null = null;
    let diffRecomputeRequestId = 0;

    const comparisonBusy = ref(false);
    let repairWorker: Worker | null = null;
    let rejectRepairCompare: ((error: Error) => void) | null = null;
    let repairInlineRequestId = 0;
    let repairInlineRaf: number | null = null;
    let pendingRepairRevealIndex: number | null = null;
    const isLargeRepairDiff = () => Boolean(opts.exactComparison?.value && diffLineChanges.length > 2000);
    let inlineLeftDecorations: string[] = [], inlineRightDecorations: string[] = [];
    const cancelComparison = () => {
        repairWorker?.terminate(); repairWorker = null;
        if (repairInlineRaf !== null) cancelAnimationFrame(repairInlineRaf);
        repairInlineRaf = null;
        pendingRepairRevealIndex = null;
        rejectRepairCompare?.(new Error('Cancelled')); rejectRepairCompare = null;
        comparisonBusy.value = false;
    };
    const requestVisibleInline = () => {
        if (repairInlineRaf !== null || !repairWorker || comparisonBusy.value || !diffRightEditor) return;
        repairInlineRaf = requestAnimationFrame(() => {
            repairInlineRaf = null;
            if (!repairWorker || comparisonBusy.value || !diffRightEditor) return;
            const visible = diffRightEditor.getVisibleRanges();
            if (!visible.length) return;
            repairWorker.postMessage({ type: 'inline', start: visible[0].startLineNumber, end: visible[visible.length - 1].endLineNumber, requestId: ++repairInlineRequestId });
        });
    };
    const compareInWorker = (left: string[], right: string[]): Promise<RepairComparisonChanges> => {
        cancelComparison();
        comparisonBusy.value = true;
        diffLineChanges = []; diffNavigationChanges = []; diffCount.value = 0; activeDiffIndex.value = -1;
        hideDiffNavigationMarkers();
        clearDiffViewZones();
        if (diffLeftEditor) {
            diffLeftDecorations = diffLeftEditor.deltaDecorations(diffLeftDecorations, []);
            inlineLeftDecorations = diffLeftEditor.deltaDecorations(inlineLeftDecorations, []);
        }
        if (diffRightEditor) {
            diffRightDecorations = diffRightEditor.deltaDecorations(diffRightDecorations, []);
            inlineRightDecorations = diffRightEditor.deltaDecorations(inlineRightDecorations, []);
        }
        return new Promise((resolve, reject) => {
            rejectRepairCompare = reject;
            try {
                const worker = new Worker(new URL('../workers/jsonRepairDiff.worker.ts', import.meta.url), { type: 'module' });
                repairWorker = worker;
                worker.onmessage = ({ data }) => {
                    if (repairWorker !== worker) return;
                    if (data.type === 'changes') { comparisonBusy.value = false; rejectRepairCompare = null; resolve({ changes: data.changes, navigationChanges: data.navigationChanges }); }
                    if (data.type === 'error') { cancelComparison(); onError(data.message); }
                    if (data.type === 'inline' && data.requestId === repairInlineRequestId && diffLeftEditor && diffRightEditor) {
                        const leftDecos: monaco.editor.IModelDeltaDecoration[] = [], rightDecos: monaco.editor.IModelDeltaDecoration[] = [];
                        for (const row of data.inline) {
                            for (const seg of row.leftSegments) leftDecos.push({ range: new monaco.Range(row.leftLine, seg.startCol, row.leftLine, seg.endCol), options: { inlineClassName: 'diff-inline-delete' } });
                            for (const seg of row.rightSegments) rightDecos.push({ range: new monaco.Range(row.rightLine, seg.startCol, row.rightLine, seg.endCol), options: { inlineClassName: 'diff-inline-insert' } });
                        }
                        inlineLeftDecorations = diffLeftEditor.deltaDecorations(inlineLeftDecorations, leftDecos);
                        inlineRightDecorations = diffRightEditor.deltaDecorations(inlineRightDecorations, rightDecos);
                        // Navigation must also bring a changed character at the end of a long line into view.
                        if (pendingRepairRevealIndex !== null) {
                            const navigationChange = diffNavigationChanges[pendingRepairRevealIndex];
                            const row = data.inline.find((item: { changeIndex: number }) => item.changeIndex === pendingRepairRevealIndex);
                            pendingRepairRevealIndex = null;
                            if (row) {
                                const segment = row.rightSegments[0] || row.leftSegments[0];
                                const editor = row.rightSegments.length ? diffRightEditor : diffLeftEditor;
                                const line = row.rightSegments.length ? row.rightLine : row.leftLine;
                                if (segment) editor.revealRangeInCenterIfOutsideViewport(new monaco.Range(line, segment.startCol, line, segment.endCol));
                            } else if (navigationChange) {
                                // A whole inserted/deleted line (e.g. `]`) has no paired character diff.
                                const hasRight = navigationChange.modifiedEndLineNumber >= navigationChange.modifiedStartLineNumber;
                                const editor = hasRight ? diffRightEditor : diffLeftEditor;
                                const line = hasRight ? navigationChange.modifiedStartLineNumber : navigationChange.originalStartLineNumber;
                                editor.revealRangeInCenterIfOutsideViewport(new monaco.Range(line, 1, line, 1));
                            }
                        }
                    }
                };
                worker.onerror = (event) => { if (worker === repairWorker) { cancelComparison(); onError(event.message || 'Diff worker failed'); } };
                worker.onmessageerror = () => { if (worker === repairWorker) { cancelComparison(); onError('Diff worker result could not be read'); } };
                worker.postMessage({ type: 'compare', left, right });
            } catch (error) { comparisonBusy.value = false; rejectRepairCompare = null; reject(error); }
        });
    };
    const diffCount = ref(0);
    const activeDiffIndex = ref(-1);
    const diffSyncButtons = ref<DiffSyncButton[]>([]);
    const diffDraftLeftText = ref(pendingLocaleState?.left.text ?? '');
    const diffDraftRightText = ref(pendingLocaleState?.right.text ?? '');

    const createDiffNavigationMarker = (editor: monaco.editor.IStandaloneCodeEditor, side: 'left' | 'right'): DiffNavigationMarker => {
        const node = document.createElement('div');
        node.className = 'diff-navigation-marker';
        node.dataset.side = side;
        node.setAttribute('aria-hidden', 'true');
        node.style.display = 'none';
        const bar = document.createElement('div');
        bar.className = 'diff-navigation-marker-bar';
        node.appendChild(bar);
        const position = { top: 0, left: 0 };
        const widget: monaco.editor.IOverlayWidget = {
            getId: () => `json-tool-diff-navigation-${side}`,
            getDomNode: () => node,
            getPosition: () => ({ preference: { ...position } }),
        };
        editor.addOverlayWidget(widget);
        return { node, bar, widget, position, animation: null };
    };

    const hideDiffNavigationMarkers = () => {
        for (const marker of [leftNavigationMarker, rightNavigationMarker]) {
            if (!marker) continue;
            marker.animation?.cancel();
            marker.animation = null;
            marker.node.style.display = 'none';
        }
    };

    const getSideNavigationBounds = (editor: monaco.editor.IStandaloneCodeEditor, start: number, end: number): DiffNavigationBounds | null => {
        if (end < start) return null;
        const lineCount = editor.getModel()?.getLineCount() ?? 1;
        const safeStart = Math.max(1, Math.min(start, lineCount));
        const safeEnd = Math.max(safeStart, Math.min(end, lineCount));
        return { top: editor.getTopForLineNumber(safeStart), bottom: editor.getBottomForLineNumber(safeEnd) };
    };

    const getNavigationBounds = (change: DiffLineChange) => {
        if (!diffLeftEditor || !diffRightEditor) return { left: null, right: null };
        const left = getSideNavigationBounds(diffLeftEditor, change.originalStartLineNumber, change.originalEndLineNumber);
        const right = getSideNavigationBounds(diffRightEditor, change.modifiedStartLineNumber, change.modifiedEndLineNumber);
        if (!isLargeRepairDiff()) {
            const aligned = getAlignedDiffNavigationBounds(left, right);
            return { left: aligned, right: aligned };
        }
        // Large comparisons omit alignment spacers. An empty side marks its
        // insertion point rather than copying the other editor's coordinates.
        const insertionPoint = (editor: monaco.editor.IStandaloneCodeEditor, start: number): DiffNavigationBounds => {
            const lineCount = editor.getModel()?.getLineCount() ?? 1;
            const top = editor.getTopForLineNumber(Math.max(1, Math.min(start, lineCount)));
            return { top, bottom: top + editor.getOption(monaco.editor.EditorOption.lineHeight) };
        };
        return {
            left: left ?? insertionPoint(diffLeftEditor, change.originalStartLineNumber),
            right: right ?? insertionPoint(diffRightEditor, change.modifiedStartLineNumber),
        };
    };

    const updateDiffNavigationMarkers = (animate = false) => {
        const change = diffNavigationChanges[activeDiffIndex.value];
        if (!change || !diffLeftEditor || !diffRightEditor || comparisonBusy.value) {
            hideDiffNavigationMarkers();
            return;
        }
        const bounds = getNavigationBounds(change);
        const update = (editor: monaco.editor.IStandaloneCodeEditor, marker: DiffNavigationMarker | null, target: DiffNavigationBounds | null) => {
            if (!marker) return;
            const layout = editor.getLayoutInfo();
            // The horizontal scrollbar covers the text area, not this gutter.
            const visible = target && getVisibleDiffNavigationMarker(target, editor.getScrollTop(), layout.height);
            if (!visible) {
                marker.node.style.display = 'none';
                return;
            }
            marker.position.top = visible.top;
            marker.position.left = layout.decorationsLeft + Math.max(0, layout.decorationsWidth - 4);
            marker.node.style.height = `${visible.height}px`;
            marker.node.style.display = '';
            marker.node.dataset.diffIndex = String(activeDiffIndex.value);
            editor.layoutOverlayWidget(marker.widget);
            if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                marker.animation?.cancel();
                marker.animation = marker.bar.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
            }
        };
        update(diffLeftEditor, leftNavigationMarker, bounds.left);
        update(diffRightEditor, rightNavigationMarker, bounds.right);
    };

    const updateDiffModelDisplayOptions = (model: monaco.editor.ITextModel, displayIndentSize: number) => {
        model.updateOptions({
            tabSize: displayIndentSize,
            indentSize: displayIndentSize,
            insertSpaces: true,
        });
    };

    // ==================== view zones / decoration ====================
    const clearDiffViewZones = () => {
        diffLeftViewZoneIds = replaceDiffViewZones(diffLeftEditor, diffLeftViewZoneIds, []);
        diffRightViewZoneIds = replaceDiffViewZones(diffRightEditor, diffRightViewZoneIds, []);
    };

    const rebuildDiffViewZones = (changes: DiffLineChange[]) => {
        // Avoid creating thousands of DOM view zones in a repair audit with widespread corruption.
        if (isLargeRepairDiff()) { clearDiffViewZones(); return; }
        if (!diffLeftEditor || !diffRightEditor) {
            diffLeftViewZoneIds = [];
            diffRightViewZoneIds = [];
            return;
        }
        const { leftSpecs, rightSpecs } = buildDiffViewZoneSpecs(diffLeftEditor, diffRightEditor, changes);
        diffLeftViewZoneIds = replaceDiffViewZones(diffLeftEditor, diffLeftViewZoneIds, leftSpecs);
        diffRightViewZoneIds = replaceDiffViewZones(diffRightEditor, diffRightViewZoneIds, rightSpecs);
    };

    // ==================== 布局调度 ====================
    const layoutDiffEditors = () => {
        layoutOneDiffEditor(diffLeftEditor, leftContainerRef.value);
        layoutOneDiffEditor(diffRightEditor, rightContainerRef.value);
    };

    const scheduleDiffEditorLayout = () => {
        if (diffEditorLayoutRaf != null) return;
        diffEditorLayoutRaf = requestAnimationFrame(() => {
            diffEditorLayoutRaf = null;
            layoutDiffEditors();
            // 下一帧再 layout 一次，确保容器在尺寸恢复后 Monaco 内容正确渲染
            requestAnimationFrame(() => {
                layoutDiffEditors();
            });
            updateDiffSyncButtons();
        });
    };

    // ==================== diff 重算 ====================
    const scheduleDiffRecompute = () => {
        if (diffRecomputeRaf != null) return;
        diffRecomputeRaf = requestAnimationFrame(() => {
            diffRecomputeRaf = null;
            recomputeDiff();
        });
    };

    const updateDiffEditorTabSize = (editor: monaco.editor.IStandaloneCodeEditor, content: string) => {
        const detected = detectIndentSize(content);
        const model = editor.getModel();
        if (model) {
            updateDiffModelDisplayOptions(model, detected);
        }
        editor.updateOptions({ tabSize: detected, indentSize: detected } as monaco.editor.IEditorOptions);
    };

    function recomputeDiff() {
        const requestId = ++diffRecomputeRequestId;
        void recomputeDiffAsync(requestId).catch((error) => { if (requestId === diffRecomputeRequestId && error.message !== 'Cancelled') onError(error.message); });
    }

    const recomputeDiffAsync = async (requestId: number) => {
        hideDiffNavigationMarkers();
        if (!diffLeftEditor || !diffRightEditor) {
            diffLineChanges = [];
            diffNavigationChanges = [];
            diffCount.value = 0;
            diffSyncButtons.value = [];
            clearDiffViewZones();
            return;
        }
        const leftEditor = diffLeftEditor;
        const rightEditor = diffRightEditor;
        const leftModel = leftEditor.getModel();
        const rightModel = rightEditor.getModel();
        if (!leftModel || !rightModel) return;

        const leftLines = leftModel.getLinesContent();
        const rightLines = rightModel.getLinesContent();
        let diffEngine: DiffEngineModule | undefined;
        let workerChanges: RepairComparisonChanges | undefined;
        try {
            if (opts.exactComparison?.value) workerChanges = await compareInWorker(leftLines, rightLines);
            else diffEngine = await loadDiffEngine();
        } catch (error: any) {
            if (requestId === diffRecomputeRequestId && error?.message !== 'Cancelled') {
                onError(`diff 引擎加载失败：${error?.message ?? String(error)}`);
            }
            return;
        }
        if (
            requestId !== diffRecomputeRequestId ||
            diffLeftEditor !== leftEditor ||
            diffRightEditor !== rightEditor ||
            leftEditor.getModel() !== leftModel ||
            rightEditor.getModel() !== rightModel
        ) {
            return;
        }

        const changes = workerChanges?.changes ?? diffEngine!.computeLineDiff(leftLines, rightLines);
        diffLineChanges = changes;
        diffNavigationChanges = workerChanges?.navigationChanges ?? changes;
        diffCount.value = diffNavigationChanges.length;
        clearDiffViewZones();
        rebuildDiffViewZones(changes);

        // 分别在左右编辑器上打差异行高亮
        const leftDecos: monaco.editor.IModelDeltaDecoration[] = [];
        const rightDecos: monaco.editor.IModelDeltaDecoration[] = [];
        for (const c of (isLargeRepairDiff() ? [] : changes)) {
            const { leftLineCount, rightLineCount, hasLeft, hasRight } = getDiffLineRangeInfo(c);

            if (hasLeft) {
                leftDecos.push({
                    range: new monaco.Range(c.originalStartLineNumber, 1, c.originalEndLineNumber, 1),
                    options: {
                        isWholeLine: true,
                        className: 'diff-line-delete',
                    },
                });
            }
            if (hasRight) {
                rightDecos.push({
                    range: new monaco.Range(c.modifiedStartLineNumber, 1, c.modifiedEndLineNumber, 1),
                    options: {
                        isWholeLine: true,
                        className: 'diff-line-insert',
                    },
                });
            }

            // 行内字符级 diff：
            // - "1 删 1 增" 的孤立替换：直接比对这两行；
            // - "N 删 N 增" 的等长替换块：按位置强配对 left[i] ↔ right[i]，
            //   因为等行数的连续替换块基本就是"逐行修改"场景，按位置配对正确率高；
            // - 行数不等（N 删 M 增且 N≠M）：跳过行内 diff，避免位置错位产生误导。
            if (diffEngine && hasLeft && hasRight && leftLineCount === rightLineCount) {
                for (let k = 0; k < leftLineCount; k++) {
                    const leftLineNo = c.originalStartLineNumber + k;
                    const rightLineNo = c.modifiedStartLineNumber + k;
                    const leftLine = leftLines[leftLineNo - 1] ?? '';
                    const rightLine = rightLines[rightLineNo - 1] ?? '';
                    const inline = diffEngine.computeInlineDiff(leftLine, rightLine);
                    if (!inline) continue;
                    for (const seg of inline.leftSegments) {
                        leftDecos.push({
                            range: new monaco.Range(leftLineNo, seg.startCol, leftLineNo, seg.endCol),
                            options: { inlineClassName: 'diff-inline-delete' },
                        });
                    }
                    for (const seg of inline.rightSegments) {
                        rightDecos.push({
                            range: new monaco.Range(rightLineNo, seg.startCol, rightLineNo, seg.endCol),
                            options: { inlineClassName: 'diff-inline-insert' },
                        });
                    }
                }
            }
        }
        diffLeftDecorations = diffLeftEditor.deltaDecorations(diffLeftDecorations, leftDecos);
        diffRightDecorations = diffRightEditor.deltaDecorations(diffRightDecorations, rightDecos);

        if (pendingLocaleState) {
            const state = pendingLocaleState;
            pendingLocaleState = undefined;
            if (state.left.viewState) leftEditor.restoreViewState(state.left.viewState);
            if (state.right.viewState) rightEditor.restoreViewState(state.right.viewState);
            activeDiffIndex.value = state.activeDiffIndex;
        }
        if (activeDiffIndex.value >= diffCount.value) activeDiffIndex.value = diffCount.value - 1;
        updateDiffSyncButtons();
        requestVisibleInline();
    };

    const paintVisibleRepairChanges = () => {
        if (!diffLeftEditor || !diffRightEditor) return;
        const build = (editor: monaco.editor.IStandaloneCodeEditor, side: 'left' | 'right') => {
            const visible = editor.getVisibleRanges();
            if (!visible.length) return [];
            const start = visible[0].startLineNumber, end = visible[visible.length - 1].endLineNumber;
            const startKey = side === 'left' ? 'originalStartLineNumber' : 'modifiedStartLineNumber';
            const endKey = side === 'left' ? 'originalEndLineNumber' : 'modifiedEndLineNumber';
            let low = 0, high = diffLineChanges.length;
            while (low < high) { const mid = (low + high) >>> 1; if (Math.max(diffLineChanges[mid][endKey], diffLineChanges[mid][startKey]) < start) low = mid + 1; else high = mid; }
            const decorations: monaco.editor.IModelDeltaDecoration[] = [];
            for (let i = low; i < diffLineChanges.length && diffLineChanges[i][startKey] <= end; i++) {
                const c = diffLineChanges[i];
                if (c[endKey] < c[startKey]) continue;
                decorations.push({ range: new monaco.Range(Math.max(start, c[startKey]), 1, Math.min(end, c[endKey]), 1), options: {
                    isWholeLine: true, className: side === 'left' ? 'diff-line-delete' : 'diff-line-insert',
                } });
            }
            return decorations;
        };
        diffLeftDecorations = diffLeftEditor.deltaDecorations(diffLeftDecorations, build(diffLeftEditor, 'left'));
        diffRightDecorations = diffRightEditor.deltaDecorations(diffRightDecorations, build(diffRightEditor, 'right'));
    };

    function updateDiffSyncButtons() {
        updateDiffNavigationMarkers();
        if (!diffLeftEditor || !diffRightEditor || diffLineChanges.length === 0) {
            diffSyncButtons.value = [];
            if (diffLineChanges.length === 0) activeDiffIndex.value = -1;
            return;
        }

        if (opts.exactComparison?.value) { if (isLargeRepairDiff()) paintVisibleRepairChanges(); requestVisibleInline(); diffSyncButtons.value = []; return; }
        const scrollTop = diffRightEditor.getScrollTop();
        const viewportHeight = diffRightEditor.getLayoutInfo().height;
        const buttons: DiffSyncButton[] = [];

        for (let i = 0; i < diffLineChanges.length; i++) {
            const buttonTop = getDiffChangeTop(diffLeftEditor, diffRightEditor, diffLineChanges[i]) - scrollTop;
            if (buttonTop < -30 || buttonTop > viewportHeight + 30) continue;
            buttons.push({ top: buttonTop, changeIndex: i });
        }
        diffSyncButtons.value = buttons;
    }

    // ==================== 跳转 / 同步 ====================
    const handleDiffSync = (changeIndex: number, direction: 'left' | 'right') => {
        if (opts.exactComparison?.value) return;
        if (!diffLeftEditor || !diffRightEditor) return;
        if (changeIndex < 0 || changeIndex >= diffLineChanges.length) return;
        activeDiffIndex.value = changeIndex;

        const origModel = diffLeftEditor.getModel();
        const modModel = diffRightEditor.getModel();
        if (!origModel || !modModel) return;

        const change = diffLineChanges[changeIndex];
        const origStart = change.originalStartLineNumber;
        const origEnd = change.originalEndLineNumber;
        const modStart = change.modifiedStartLineNumber;
        const modEnd = change.modifiedEndLineNumber;

        // 关键：把"同步箭头"整个操作包成一个独立的 undo step，
        // 这样 Ctrl+Z 能精准撤销这一次同步，而不会和用户之前/之后的手动输入合并。
        // 只对实际被修改的一侧模型切 undo step。
        const targetModel = direction === 'left' ? origModel : modModel;
        targetModel.pushStackElement();

        if (direction === 'left') {
            // 右 → 左：用 modified 的内容覆盖 original 的差异块
            const modContent = modEnd >= modStart ? modModel.getValueInRange(new monaco.Range(modStart, 1, modEnd, modModel.getLineMaxColumn(modEnd))) : '';
            if (origEnd < origStart) {
                // 左侧是纯插入点（没有对应行）→ 在 origStart 所指行之后插入
                if (modContent) {
                    const insertLine = Math.max(1, origStart);
                    const totalLines = origModel.getLineCount();
                    const range =
                        insertLine > totalLines
                            ? new monaco.Range(totalLines, origModel.getLineMaxColumn(totalLines), totalLines, origModel.getLineMaxColumn(totalLines))
                            : new monaco.Range(insertLine, 1, insertLine, 1);
                    const text = insertLine > totalLines ? '\n' + modContent : modContent + '\n';
                    diffLeftEditor.executeEdits('diff-sync-right-to-left', [{ range, text }]);
                }
            } else if (modContent) {
                diffLeftEditor.executeEdits('diff-sync-right-to-left', [
                    {
                        range: new monaco.Range(origStart, 1, origEnd, origModel.getLineMaxColumn(origEnd)),
                        text: modContent,
                    },
                ]);
            } else {
                const totalLines = origModel.getLineCount();
                const delEnd = origEnd + 1;
                const delRange =
                    delEnd <= totalLines
                        ? new monaco.Range(origStart, 1, delEnd, 1)
                        : new monaco.Range(
                              Math.max(1, origStart - 1),
                              origStart > 1 ? origModel.getLineMaxColumn(origStart - 1) : 1,
                              origEnd,
                              origModel.getLineMaxColumn(origEnd),
                          );
                diffLeftEditor.executeEdits('diff-sync-right-to-left', [{ range: delRange, text: '' }]);
            }
        } else {
            // 左 → 右：用 original 的内容覆盖 modified 的差异块
            const origContent =
                origEnd >= origStart ? origModel.getValueInRange(new monaco.Range(origStart, 1, origEnd, origModel.getLineMaxColumn(origEnd))) : '';
            if (modEnd < modStart) {
                if (origContent) {
                    const insertLine = Math.max(1, modStart);
                    const totalLines = modModel.getLineCount();
                    const range =
                        insertLine > totalLines
                            ? new monaco.Range(totalLines, modModel.getLineMaxColumn(totalLines), totalLines, modModel.getLineMaxColumn(totalLines))
                            : new monaco.Range(insertLine, 1, insertLine, 1);
                    const text = insertLine > totalLines ? '\n' + origContent : origContent + '\n';
                    diffRightEditor.executeEdits('diff-sync-left-to-right', [{ range, text }]);
                }
            } else if (origContent) {
                diffRightEditor.executeEdits('diff-sync-left-to-right', [
                    {
                        range: new monaco.Range(modStart, 1, modEnd, modModel.getLineMaxColumn(modEnd)),
                        text: origContent,
                    },
                ]);
            } else {
                const totalLines = modModel.getLineCount();
                const delEnd = modEnd + 1;
                const delRange =
                    delEnd <= totalLines
                        ? new monaco.Range(modStart, 1, delEnd, 1)
                        : new monaco.Range(
                              Math.max(1, modStart - 1),
                              modStart > 1 ? modModel.getLineMaxColumn(modStart - 1) : 1,
                              modEnd,
                              modModel.getLineMaxColumn(modEnd),
                          );
                diffRightEditor.executeEdits('diff-sync-left-to-right', [{ range: delRange, text: '' }]);
            }
        }

        // 同步后再切一次，确保后续的手动输入不会被合并进来
        targetModel.pushStackElement();
    };

    const revealDiffChange = (index: number) => {
        if (!diffLeftEditor || !diffRightEditor) return;
        if (index < 0 || index >= diffNavigationChanges.length) return;
        const change = diffNavigationChanges[index];
        activeDiffIndex.value = index;
        if (opts.exactComparison?.value) pendingRepairRevealIndex = index;
        const bounds = getNavigationBounds(change);
        if (isLargeRepairDiff()) {
            for (const [editor, target] of [[diffLeftEditor, bounds.left], [diffRightEditor, bounds.right]] as const) {
                if (!target) continue;
                const layout = editor.getLayoutInfo();
                const scrollTop = getDiffNavigationScrollTop(target, editor.getScrollTop(), layout.height - layout.horizontalScrollbarHeight, editor.getOption(monaco.editor.EditorOption.lineHeight));
                if (scrollTop !== null) editor.setScrollTop(scrollTop);
            }
            updateDiffSyncButtons();
            updateDiffNavigationMarkers(true);
            return;
        }
        if (!bounds.right) return;
        const layout = diffRightEditor.getLayoutInfo();
        const viewportHeight = layout.height - layout.horizontalScrollbarHeight;
        const rightLineHeight = diffRightEditor.getOption(monaco.editor.EditorOption.lineHeight);
        const targetScrollTop = getDiffNavigationScrollTop(bounds.right, diffRightEditor.getScrollTop(), viewportHeight, rightLineHeight);

        diffSyncingScroll = true;
        try {
            if (targetScrollTop !== null) {
                diffLeftEditor.setScrollTop(targetScrollTop);
                diffRightEditor.setScrollTop(targetScrollTop);
            }
        } finally {
            diffSyncingScroll = false;
        }
        requestVisibleInline();
        updateDiffNavigationMarkers(true);
    };

    const goToNextDiff = () => {
        if (diffNavigationChanges.length === 0) return;
        activeDiffIndex.value = activeDiffIndex.value < 0 ? 0 : (activeDiffIndex.value + 1) % diffNavigationChanges.length;
        revealDiffChange(activeDiffIndex.value);
        updateDiffSyncButtons();
    };

    const goToPrevDiff = () => {
        if (diffNavigationChanges.length === 0) return;
        activeDiffIndex.value =
            activeDiffIndex.value < 0 ? diffNavigationChanges.length - 1 : (activeDiffIndex.value - 1 + diffNavigationChanges.length) % diffNavigationChanges.length;
        revealDiffChange(activeDiffIndex.value);
        updateDiffSyncButtons();
    };

    // ==================== 草稿持久化 ====================
    const captureDiffDraftFromEditors = () => {
        if (!diffLeftEditor || !diffRightEditor) return;
        diffDraftLeftText.value = diffLeftEditor.getValue() ?? '';
        diffDraftRightText.value = diffRightEditor.getValue() ?? '';
    };

    const saveDiffDraft = async (reason: string) => {
        if (opts.exactComparison?.value) return;
        if (typeof window === 'undefined') return;
        if (!tabId.value) return;

        // 优先从 editor 读取；如果当前不在 diff 模式，则保存上次 exit 时缓存的内容
        if (diffLeftEditor && diffRightEditor) {
            captureDiffDraftFromEditors();
        }

        const left = diffDraftLeftText.value ?? '';
        const right = diffDraftRightText.value ?? '';

        const leftSize = calculateByteSize(left);
        const rightSize = calculateByteSize(right);
        if (leftSize > MAX_DIFF_SIDE_SIZE || rightSize > MAX_DIFF_SIDE_SIZE) {
            onError(
                `diff 草稿保存失败：左右任一侧内容大小不能超过 30MB（当前左 ${Math.round(leftSize / (1024 * 1024))}MB，右 ${Math.round(rightSize / (1024 * 1024))}MB）`,
            );
            return;
        }

        try {
            const existing = await idbGet<DiffDraftRecord>(IDB_STORE_DIFF_DRAFTS, tabId.value);
            if (!existing) {
                const count = await idbCount(IDB_STORE_DIFF_DRAFTS);
                if (count >= MAX_DIFF_TAB_COUNT) {
                    onError(`diff 草稿保存失败：已达到标签页数量上限（${MAX_DIFF_TAB_COUNT}个）`);
                    return;
                }
            }
            const record: DiffDraftRecord = {
                tabId: tabId.value,
                leftText: left,
                rightText: right,
                updatedAt: Date.now(),
                version: 1,
            };
            await idbPut(IDB_STORE_DIFF_DRAFTS, record);
        } catch (e: any) {
            onError(`diff 草稿保存失败（${reason}）：${e?.message ?? String(e)}`);
        }
    };

    const loadDiffDraftSnapshot = async () => {
        if (opts.exactComparison?.value) return;
        if (typeof window === 'undefined') return;
        if (!tabId.value) return;

        try {
            const record = await idbGet<DiffDraftRecord>(IDB_STORE_DIFF_DRAFTS, tabId.value);
            diffDraftLeftText.value = record?.leftText ?? '';
            diffDraftRightText.value = record?.rightText ?? '';
        } catch (e: any) {
            onError(`diff 草稿加载失败：${e?.message ?? String(e)}`);
        }
    };

    const restoreDiffDraftIntoEditors = async () => {
        if (skipInitialDraftRestore) { skipInitialDraftRestore = false; return; }
        if (opts.exactComparison?.value) return;
        if (typeof window === 'undefined') return;
        if (!tabId.value) return;
        if (!diffLeftEditor || !diffRightEditor) return;

        try {
            const record = await idbGet<DiffDraftRecord>(IDB_STORE_DIFF_DRAFTS, tabId.value);
            if (!record) return;
            diffDraftLeftText.value = record.leftText ?? '';
            diffDraftRightText.value = record.rightText ?? '';

            const leftModel = diffLeftEditor.getModel();
            const rightModel = diffRightEditor.getModel();
            if (leftModel) leftModel.setValue(diffDraftLeftText.value);
            if (rightModel) rightModel.setValue(diffDraftRightText.value);
        } catch (e: any) {
            onError(`diff 草稿恢复失败：${e?.message ?? String(e)}`);
        }
    };

    // ==================== 创建 / 销毁 ====================
    const createDiffEditor = () => {
        if (!leftContainerRef.value || !rightContainerRef.value) return;

        const initialIndentSize = detectIndentSize('');
        const baseOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
            language: 'json',
            theme: getJsonToolThemeForLanguage('json', themeMode.value),
            folding: false,
            readOnly: opts.exactComparison?.value ?? false,
            minimap: { enabled: showMinimap.value },
            lineNumbers: 'on',
            lineNumbersMinChars: 2,
            roundedSelection: true,
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            padding: { bottom: 0 },
            scrollbar: {
                horizontal: 'auto',
                verticalScrollbarSize: JSON_TOOL_EDITOR_SCROLLBAR_THICKNESS,
                horizontalScrollbarSize: JSON_TOOL_EDITOR_HORIZONTAL_SCROLLBAR_THICKNESS,
                verticalSliderSize: JSON_TOOL_EDITOR_SCROLLBAR_THICKNESS,
                horizontalSliderSize: JSON_TOOL_EDITOR_HORIZONTAL_SCROLLBAR_THICKNESS,
                ignoreHorizontalScrollbarInContentHeight: true,
                useShadows: false,
            },
            fontSize: fontSize.value,
            lineHeight: 16,
            tabSize: initialIndentSize,
            // 注意：设置对话框里的 switch 做了值反转（active=false, inactive=true），
            // 所以 wordWrap.value === true 代表"用户要不换行"。
            // 此处必须与 getEditorOptions / updateWordWrap 保持同一语义约定，
            ...getJsonToolWordWrapOptions(wordWrap.value),
            unicodeHighlight: {
                ambiguousCharacters: true,
                invisibleCharacters: true,
                nonBasicASCII: false,
            },
            stickyScroll: { enabled: false },
            automaticLayout: false,
            renderLineHighlight: 'all',
            renderLineHighlightOnlyWhenFocus: true,
            // 与普通模式保持一致：禁用查找框打开时顶部预留的空行，
            // 否则 Cmd/Ctrl+F 弹出查找框时第一行上方会出现一段无行号的空白。
            find: {
                addExtraSpaceOnTop: false,
                autoFindInSelection: 'multiline' as const,
                seedSearchStringFromSelection: 'always' as const,
            },
            guides: {
                indentation: true,
                bracketPairs: true,
                highlightActiveIndentation: true,
            },
            bracketPairColorization: {
                enabled: true,
            },
        };

        const leftModel = monaco.editor.createModel(pendingLocaleState?.left.text ?? '', 'json');
        const rightModel = monaco.editor.createModel(pendingLocaleState?.right.text ?? '', 'json');
        updateDiffModelDisplayOptions(leftModel, initialIndentSize);
        updateDiffModelDisplayOptions(rightModel, initialIndentSize);

        diffLeftEditor = monaco.editor.create(leftContainerRef.value, {
            ...baseOptions,
            model: leftModel,
        });
        diffRightEditor = monaco.editor.create(rightContainerRef.value, {
            ...baseOptions,
            model: rightModel,
        });
        leftNavigationMarker = createDiffNavigationMarker(diffLeftEditor, 'left');
        rightNavigationMarker = createDiffNavigationMarker(diffRightEditor, 'right');
        updateDiffEditorTabSize(diffLeftEditor, leftModel.getValue());
        updateDiffEditorTabSize(diffRightEditor, rightModel.getValue());

        diffLeftTextareaAttrObserver?.disconnect();
        diffRightTextareaAttrObserver?.disconnect();
        diffLeftTextareaAttrObserver = ensureMonacoTextareaAttrs(leftContainerRef.value, 'monaco-diff-left-editor');
        diffRightTextareaAttrObserver = ensureMonacoTextareaAttrs(rightContainerRef.value, 'monaco-diff-right-editor');

        updateLineNumberWidth(diffLeftEditor);
        updateLineNumberWidth(diffRightEditor);

        // 跟踪左右 diff 编辑器的聚焦，让 Cmd/Ctrl+F 全局快捷键能正确定位到当前激活的一侧
        trackEditorFocus(diffLeftEditor);
        trackEditorFocus(diffRightEditor);

        // 双击选中整段字符串（与普通模式 input 一致，仅选中不复制，方便就地修改）
        setupDoubleClickSelectString(diffLeftEditor, false);
        setupDoubleClickSelectString(diffRightEditor, false);

        // 右键菜单：Base64 / URL 编解码（与普通模式 input 一致，使用同一份 i18n 文案）
        registerClipboardActions(diffLeftEditor);
        registerClipboardActions(diffRightEditor);
        if (!opts.exactComparison?.value) {
            registerEncodingActions(diffLeftEditor);
            registerEncodingActions(diffRightEditor);
        }
        filterBuiltinContextMenuActions(diffLeftEditor, [
            'editor.action.changeAll',
            'editor.action.clipboardCutAction',
            'editor.action.clipboardCopyAction',
            'editor.action.clipboardPasteAction',
        ]);
        filterBuiltinContextMenuActions(diffRightEditor, [
            'editor.action.changeAll',
            'editor.action.clipboardCutAction',
            'editor.action.clipboardCopyAction',
            'editor.action.clipboardPasteAction',
        ]);

        diffContentDisposables.push(
            ...setupSelectionListener(diffLeftEditor, leftStatusRef),
            ...setupSelectionListener(diffRightEditor, rightStatusRef),
            leftModel.onDidChangeContent(() => {
                if (diffLeftEditor) updateDiffEditorTabSize(diffLeftEditor, leftModel.getValue());
                if (diffLeftEditor) updateLineNumberWidth(diffLeftEditor);
                scheduleDiffRecompute();
            }),
            rightModel.onDidChangeContent(() => {
                if (diffRightEditor) updateDiffEditorTabSize(diffRightEditor, rightModel.getValue());
                if (diffRightEditor) updateLineNumberWidth(diffRightEditor);
                scheduleDiffRecompute();
            }),
            diffLeftEditor.onDidScrollChange((e) => {
                if (isLargeRepairDiff()) { updateDiffSyncButtons(); return; }
                if (diffSyncingScroll || !diffRightEditor) return;
                diffSyncingScroll = true;
                try {
                    diffRightEditor.setScrollTop(e.scrollTop);
                    diffRightEditor.setScrollLeft(e.scrollLeft);
                } finally {
                    diffSyncingScroll = false;
                }
                updateDiffSyncButtons();
            }),
            diffRightEditor.onDidScrollChange((e) => {
                if (isLargeRepairDiff()) { updateDiffSyncButtons(); return; }
                if (diffSyncingScroll || !diffLeftEditor) return;
                diffSyncingScroll = true;
                try {
                    diffLeftEditor.setScrollTop(e.scrollTop);
                    diffLeftEditor.setScrollLeft(e.scrollLeft);
                } finally {
                    diffSyncingScroll = false;
                }
                updateDiffSyncButtons();
            }),
            diffLeftEditor.onDidLayoutChange(() => updateDiffSyncButtons()),
            diffRightEditor.onDidLayoutChange(() => updateDiffSyncButtons()),
        );

        // ResizeObserver 分别监听两个容器
        if (typeof ResizeObserver !== 'undefined') {
            diffLeftResizeObserver?.disconnect();
            diffRightResizeObserver?.disconnect();
            diffLeftResizeObserver = new ResizeObserver(() => scheduleDiffEditorLayout());
            diffRightResizeObserver = new ResizeObserver(() => scheduleDiffEditorLayout());
            diffLeftResizeObserver.observe(leftContainerRef.value);
            diffRightResizeObserver.observe(rightContainerRef.value);
        }

        scheduleDiffEditorLayout();
        scheduleDiffRecompute();
    };

    const destroyDiffEditor = () => {
        pendingLocaleState = undefined;
        skipInitialDraftRestore = false;
        cancelComparison();
        hideDiffNavigationMarkers();
        inlineLeftDecorations = []; inlineRightDecorations = [];
        diffRecomputeRequestId++;
        diffContentDisposables.forEach((d) => d.dispose());
        diffContentDisposables = [];
        diffSyncButtons.value = [];
        activeDiffIndex.value = -1;
        leftStatusRef.value = '';
        rightStatusRef.value = '';
        clearDiffViewZones();

        if (diffLeftResizeObserver) {
            diffLeftResizeObserver.disconnect();
            diffLeftResizeObserver = null;
        }
        if (diffRightResizeObserver) {
            diffRightResizeObserver.disconnect();
            diffRightResizeObserver = null;
        }
        if (diffLeftTextareaAttrObserver) {
            diffLeftTextareaAttrObserver.disconnect();
            diffLeftTextareaAttrObserver = null;
        }
        if (diffRightTextareaAttrObserver) {
            diffRightTextareaAttrObserver.disconnect();
            diffRightTextareaAttrObserver = null;
        }
        if (diffEditorLayoutRaf != null) {
            cancelAnimationFrame(diffEditorLayoutRaf);
            diffEditorLayoutRaf = null;
        }
        if (diffRecomputeRaf != null) {
            cancelAnimationFrame(diffRecomputeRaf);
            diffRecomputeRaf = null;
        }

        if (diffLeftEditor) {
            const m = diffLeftEditor.getModel();
            onBeforeDisposeEditor?.(diffLeftEditor);
            diffLeftEditor.dispose();
            m?.dispose();
            diffLeftEditor = null;
        }
        if (diffRightEditor) {
            const m = diffRightEditor.getModel();
            onBeforeDisposeEditor?.(diffRightEditor);
            diffRightEditor.dispose();
            m?.dispose();
            diffRightEditor = null;
        }
        diffLineChanges = [];
        diffNavigationChanges = [];
        diffLeftDecorations = [];
        diffRightDecorations = [];
        diffLeftViewZoneIds = [];
        diffRightViewZoneIds = [];
        leftNavigationMarker = null;
        rightNavigationMarker = null;
        diffCount.value = 0;
    };

    // ==================== 选项透传 ====================
    const updateDiffEditorOptions = (options: monaco.editor.IEditorOptions) => {
        diffLeftEditor?.updateOptions(options);
        diffRightEditor?.updateOptions(options);
    };

    return {
        comparisonBusy, cancelComparison,
        diffCount,
        activeDiffIndex,
        diffSyncButtons,
        diffDraftLeftText,
        diffDraftRightText,

        getDiffLeftEditor: () => diffLeftEditor,
        getDiffRightEditor: () => diffRightEditor,
        getDiffSideEditor: (side) => (side === 'left' ? diffLeftEditor : diffRightEditor),
        isDiffEditorReady: () => diffLeftEditor != null && diffRightEditor != null,

        createDiffEditor,
        destroyDiffEditor,

        scheduleDiffEditorLayout,
        scheduleDiffRecompute,

        recomputeDiff,
        updateDiffSyncButtons,
        goToNextDiff,
        goToPrevDiff,
        revealDiffChange,
        handleDiffSync,

        captureDiffDraftFromEditors,
        saveDiffDraft,
        loadDiffDraftSnapshot,
        restoreDiffDraftIntoEditors,

        updateDiffEditorOptions,
        layoutDiffEditors,
    };
};
