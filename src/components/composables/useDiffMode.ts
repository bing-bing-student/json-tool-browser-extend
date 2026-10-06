// Diff 模式：包裹 useDiffEditors，并把 diff 模式的所有页面级逻辑（进入/退出、6 个 diff 操作、
// 跨模式数据流、草稿持久化）下沉到这里，让主文件只关心普通模式。
//
// 与 useDiffEditors 的边界：
//   - useDiffEditors 只负责 Monaco 双编辑器的实例 + diff 计算 / 装饰 / 同步滚动 / 草稿存取
//   - useDiffMode 在它之上叠加：
//       * isDiffMode / pagehide 监听 / 状态切换
//       * diffFormatJSON / diffSortJSON / diffCopy / diffClear / diffHandleUpload / diffDownload
//       * sendInputContentToDiff / sendContentToDiff（普通模式 → diff 草稿）
//
// 与主文件的边界：
//   - 主文件通过 ctx 注入：设置 ref（fontSize / wordWrap / ...）、通知函数、
//     普通编辑器生命周期、字段排序对话框入口、jsonEngine 包装回调
//   - 子组件 JsonToolDiffPane 通过 inject 拿到本 composable 的返回值，自行渲染模板

import { type UploadFile } from 'element-plus';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { type Ref, type InjectionKey, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { calculateHash } from '../utils/byteUtils';
import { replaceEditorValuePreservingUndo } from '../utils/diffMonaco';
import { type SettingsTxt } from '../utils/i18n';
import { IDB_DB_NAME, IDB_DB_VERSION, IDB_STORE_TAB_HEARTBEATS } from '../utils/idb';
import { type SortOrder } from '../utils/jsonSort';
import type { JsonToolThemeMode } from '../utils/monacoThemes';

import { type UseDiffEditorsReturn, useDiffEditors } from './useDiffEditors';

const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30 MB

interface InputContextKeyHandle {
    set: (value: boolean) => void;
}

export interface UseDiffModeCtx {
    // i18n
    settingsTxt: Ref<SettingsTxt>;
    locale: Ref<'zh' | 'en' | undefined>;

    // 标签页 / 关闭状态
    tabId: Ref<string>;
    isTabPageClosing: Ref<boolean>;

    // 设置项（直接复用 useToolSettings 的 ref）
    showMinimap: Ref<boolean>;
    fontSize: Ref<number>;
    wordWrap: Ref<boolean>;
    themeMode: Ref<JsonToolThemeMode>;
    diffSortArrays: Ref<boolean>;
    sortOrder: Ref<SortOrder>;

    // 通知
    showMessageSuccess: (msg: string) => void;
    showMessageWarning: (msg: string) => void;
    showMessageError: (msg: string) => void;

    // 普通模式编辑器：getter + 生命周期
    getInputEditor: () => monaco.editor.IStandaloneCodeEditor | null;
    cacheNormalEditorsState: () => void;
    destroyNormalEditors: () => void;
    restoreNormalEditors: () => Promise<void>;

    // 共享 editor helper（透传给 useDiffEditors）
    trackEditorFocus: (editor: monaco.editor.IStandaloneCodeEditor) => void;
    setupDoubleClickSelectString: (editor: monaco.editor.IStandaloneCodeEditor, copy: boolean) => void;
    registerClipboardActions: (editor: monaco.editor.IStandaloneCodeEditor) => void;
    registerEncodingActions: (editor: monaco.editor.IStandaloneCodeEditor) => void;
    filterBuiltinContextMenuActions: (editor: monaco.editor.IStandaloneCodeEditor, hiddenIds: string[]) => void;
    setupSelectionListener: (editor: monaco.editor.IStandaloneCodeEditor, statusRef: Ref<string>) => monaco.IDisposable[];
    updateLineNumberWidth: (editor: monaco.editor.IStandaloneCodeEditor) => void;
    detectIndentSize: (content: string) => number;
    onBeforeDisposeEditor?: (editor: monaco.editor.IStandaloneCodeEditor) => void;

    // JSON 操作回调（封装 jsonEngine / diff 专用排序细节，避免把它们下沉）
    /** 把 value 解析并按当前 encoding/indent/arrayNewLine/preserveNumberLiterals 重新格式化。失败抛错。 */
    formatJsonValue: (value: string) => string;
    /** Diff 专用规范排序：对象固定按 key 排，数组是否排序由 diffSortArrays 控制。失败抛错。 */
    sortJsonForDiffValue: (value: string, sortArrays: boolean, order: SortOrder) => string;
}

export interface UseDiffModeReturn {
    // 模式状态
    isDiffMode: Ref<boolean>;
    diffLeftEditorContainer: Ref<HTMLElement | null>;
    diffRightEditorContainer: Ref<HTMLElement | null>;
    diffLeftEditorStatus: Ref<string>;
    diffRightEditorStatus: Ref<string>;

    // 透传 useDiffEditors 的视图层 ref
    diffCount: Ref<number>;
    activeDiffIndex: Ref<number>;
    diffSyncButtons: UseDiffEditorsReturn['diffSyncButtons'];
    diffDraftLeftText: Ref<string>;
    diffDraftRightText: Ref<string>;

    // 模式生命周期
    enterDiffMode: () => void;
    exitDiffMode: () => Promise<void>;

    // editor 访问器
    getDiffLeftEditor: () => monaco.editor.IStandaloneCodeEditor | null;
    getDiffRightEditor: () => monaco.editor.IStandaloneCodeEditor | null;
    getDiffSideEditor: (side: 'left' | 'right') => monaco.editor.IStandaloneCodeEditor | null;

    // 子组件 onMounted / onBeforeUnmount 钩子
    handleDiffPaneMounted: () => void;

    // 选项 / 布局 / 销毁
    updateDiffEditorOptions: (options: monaco.editor.IEditorOptions) => void;
    layoutDiffEditors: () => void;
    scheduleDiffEditorLayout: () => void;
    scheduleDiffRecompute: () => void;
    destroyDiffEditor: () => void;

    // 草稿
    loadDiffDraftSnapshot: () => Promise<void>;
    captureDiffDraftFromEditors: () => void;
    saveDiffDraft: (reason: string) => Promise<void>;

    // 跳转 / 同步
    goToNextDiff: () => void;
    goToPrevDiff: () => void;
    handleDiffSync: (changeIndex: number, direction: 'left' | 'right') => void;

    // 工具栏六大动作（左右双份）
    diffFormatJSON: (side: 'left' | 'right') => void;
    diffSortJSON: (side: 'left' | 'right') => void;
    diffCopy: (side: 'left' | 'right') => Promise<void>;
    diffClear: (side: 'left' | 'right') => void;
    diffHandleUpload: (side: 'left' | 'right') => (uploadFile: UploadFile) => void;
    diffDownload: (side: 'left' | 'right') => Promise<void>;

    // 普通模式 → diff 草稿
    sendInputContentToDiff: (side: 'left' | 'right') => Promise<void>;
    sendContentToDiff: (side: 'left' | 'right', content: string, emptyMessage?: string) => Promise<void>;
    setInputSendToDiffContextKeys: (left: InputContextKeyHandle | null, right: InputContextKeyHandle | null) => void;
    clearInputSendToDiffContextKeys: () => void;
}

export const DIFF_MODE_INJECTION_KEY: InjectionKey<UseDiffModeReturn> = Symbol('diffMode');

export const useDiffMode = (ctx: UseDiffModeCtx): UseDiffModeReturn => {
    // ==================== 状态 ====================
    const isDiffMode = ref(false);
    const diffLeftEditorContainer = ref<HTMLElement | null>(null);
    const diffRightEditorContainer = ref<HTMLElement | null>(null);
    const diffLeftEditorStatus = ref('');
    const diffRightEditorStatus = ref('');
    let sendToDiffContextKeyPairs: Array<{ left: InputContextKeyHandle; right: InputContextKeyHandle }> = [];

    // ==================== 包裹 useDiffEditors ====================
    const diffEditors = useDiffEditors({
        leftContainerRef: diffLeftEditorContainer,
        rightContainerRef: diffRightEditorContainer,
        leftStatusRef: diffLeftEditorStatus,
        rightStatusRef: diffRightEditorStatus,
        tabId: ctx.tabId,
        onError: ctx.showMessageError,
        showMinimap: ctx.showMinimap,
        fontSize: ctx.fontSize,
        wordWrap: ctx.wordWrap,
        themeMode: ctx.themeMode,
        trackEditorFocus: ctx.trackEditorFocus,
        setupDoubleClickSelectString: ctx.setupDoubleClickSelectString,
        registerClipboardActions: ctx.registerClipboardActions,
        registerEncodingActions: ctx.registerEncodingActions,
        filterBuiltinContextMenuActions: ctx.filterBuiltinContextMenuActions,
        setupSelectionListener: ctx.setupSelectionListener,
        updateLineNumberWidth: ctx.updateLineNumberWidth,
        detectIndentSize: ctx.detectIndentSize,
        onBeforeDisposeEditor: ctx.onBeforeDisposeEditor,
    });

    const {
        diffCount,
        activeDiffIndex,
        diffSyncButtons,
        diffDraftLeftText,
        diffDraftRightText,
        getDiffLeftEditor,
        getDiffRightEditor,
        getDiffSideEditor,
        createDiffEditor,
        destroyDiffEditor,
        scheduleDiffEditorLayout,
        scheduleDiffRecompute,
        goToNextDiff,
        goToPrevDiff,
        handleDiffSync,
        captureDiffDraftFromEditors,
        saveDiffDraft,
        loadDiffDraftSnapshot,
        restoreDiffDraftIntoEditors,
        updateDiffEditorOptions,
        layoutDiffEditors,
    } = diffEditors;

    // ==================== 模式生命周期 ====================
    const enterDiffMode = () => {
        ctx.cacheNormalEditorsState();
        ctx.destroyNormalEditors();
        isDiffMode.value = true;
        // 实际 createDiffEditor 由子组件 onMounted 触发（v-if 渲染后才有 DOM 容器）
    };

    const exitDiffMode = async () => {
        captureDiffDraftFromEditors();
        void saveDiffDraft('退出 diff');
        destroyDiffEditor();
        isDiffMode.value = false;
        await ctx.restoreNormalEditors();
    };

    // 子组件 onMounted：v-if 渲染了 .diff-editor-instance 后再创建 Monaco
    const handleDiffPaneMounted = () => {
        createDiffEditor();
        void restoreDiffDraftIntoEditors();
    };

    // ==================== 输入区 → Diff 草稿 ====================
    const refreshInputSendToDiffContextKey = () => {
        const canSendLeft = !isDiffMode.value && !diffDraftLeftText.value.trim();
        const canSendRight = !isDiffMode.value && !diffDraftRightText.value.trim();
        sendToDiffContextKeyPairs.forEach(({ left, right }) => {
            left.set(canSendLeft);
            right.set(canSendRight);
        });
    };

    watch([isDiffMode, diffDraftLeftText, diffDraftRightText], () => {
        refreshInputSendToDiffContextKey();
    });

    const sendContentToDiff = async (side: 'left' | 'right', content: string, emptyMessage?: string) => {
        const targetDraftText = side === 'left' ? diffDraftLeftText.value : diffDraftRightText.value;
        if (targetDraftText.trim()) {
            const sideLabel = side === 'left' ? (ctx.locale.value === 'en' ? 'Left' : '左') : ctx.locale.value === 'en' ? 'Right' : '右';
            ctx.showMessageWarning(ctx.settingsTxt.value.msgSendToDiffTargetNotEmpty(sideLabel));
            refreshInputSendToDiffContextKey();
            return;
        }

        if (!content.trim()) {
            ctx.showMessageWarning(emptyMessage ?? ctx.settingsTxt.value.msgInputContentRequired);
            return;
        }

        if (side === 'left') {
            diffDraftLeftText.value = content;
        } else {
            diffDraftRightText.value = content;
        }

        await saveDiffDraft(`发送到 diff ${side}`);
        const sideLabel = side === 'left' ? (ctx.locale.value === 'en' ? 'Left' : '左') : ctx.locale.value === 'en' ? 'Right' : '右';
        ctx.showMessageSuccess(ctx.settingsTxt.value.msgSendToDiffSuccess(sideLabel));
    };

    const sendInputContentToDiff = async (side: 'left' | 'right') => {
        const inputEditor = ctx.getInputEditor();
        const content = inputEditor?.getValue() ?? '';
        await sendContentToDiff(side, content, ctx.settingsTxt.value.msgInputContentRequired);
    };

    const setInputSendToDiffContextKeys = (left: InputContextKeyHandle | null, right: InputContextKeyHandle | null) => {
        if (!left || !right) {
            sendToDiffContextKeyPairs = [];
            return;
        }
        sendToDiffContextKeyPairs.push({ left, right });
        refreshInputSendToDiffContextKey();
    };

    const clearInputSendToDiffContextKeys = () => {
        sendToDiffContextKeyPairs = [];
    };

    // ==================== 6 个 diff 操作 ====================
    const diffFormatJSON = (side: 'left' | 'right') => {
        const editor = getDiffSideEditor(side);
        if (!editor) return;
        const value = editor.getValue();
        if (!value.trim()) {
            ctx.showMessageError(ctx.settingsTxt.value.msgInputJsonRequired);
            return;
        }
        try {
            const formatted = ctx.formatJsonValue(value);
            replaceEditorValuePreservingUndo(editor, formatted, `diff-format-${side}`);
            ctx.showMessageSuccess(ctx.settingsTxt.value.msgFormatSuccess);
        } catch (error: any) {
            ctx.showMessageError(ctx.settingsTxt.value.msgFormatFail(error?.message ?? String(error)));
        }
    };

    const diffSortJSON = (side: 'left' | 'right') => {
        const editor = getDiffSideEditor(side);
        if (!editor) return;
        const value = editor.getValue();
        if (!value.trim()) {
            ctx.showMessageError(ctx.settingsTxt.value.msgNoSortableContent);
            return;
        }
        try {
            const sorted = ctx.sortJsonForDiffValue(value, ctx.diffSortArrays.value, ctx.sortOrder.value);
            replaceEditorValuePreservingUndo(editor, sorted, `diff-sort-${side}`);
            ctx.showMessageSuccess(ctx.settingsTxt.value.msgSortSuccess);
        } catch (error: any) {
            ctx.showMessageError(ctx.settingsTxt.value.msgSortFail(error?.message ?? String(error)));
        }
    };

    const diffCopy = async (side: 'left' | 'right') => {
        const editor = getDiffSideEditor(side);
        if (!editor) return;
        const value = editor.getValue();
        if (!value) {
            ctx.showMessageWarning(ctx.settingsTxt.value.msgNoCopyContent);
            return;
        }
        try {
            await navigator.clipboard.writeText(value);
            ctx.showMessageSuccess(ctx.settingsTxt.value.msgCopySuccess);
        } catch {
            ctx.showMessageError(ctx.settingsTxt.value.msgCopyFail);
        }
    };

    const diffClear = (side: 'left' | 'right') => {
        const editor = getDiffSideEditor(side);
        if (!editor) return;
        replaceEditorValuePreservingUndo(editor, '', `diff-clear-${side}`);
        ctx.showMessageSuccess(ctx.settingsTxt.value.msgCleared);
    };

    const diffHandleUpload = (side: 'left' | 'right') => (uploadFile: UploadFile) => {
        const file = uploadFile.raw as File;
        if (!file) {
            ctx.showMessageError(ctx.settingsTxt.value.msgFileGetFail);
            return;
        }
        if (!file.name.toLowerCase().endsWith('.json')) {
            ctx.showMessageError(ctx.settingsTxt.value.msgFileOnlyJson);
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            ctx.showMessageError(ctx.settingsTxt.value.msgFileTooLarge);
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            if (e.target?.result) {
                const editor = getDiffSideEditor(side);
                if (editor) {
                    replaceEditorValuePreservingUndo(editor, e.target.result as string, `diff-upload-${side}`);
                    ctx.showMessageSuccess(ctx.settingsTxt.value.msgFileUploadSuccess);
                }
            }
        };
        reader.onerror = () => ctx.showMessageError(ctx.settingsTxt.value.msgFileReadError);
        reader.readAsText(file, 'utf-8');
    };

    const diffDownload = async (side: 'left' | 'right') => {
        const editor = getDiffSideEditor(side);
        if (!editor) return;
        const content = editor.getValue();
        if (!content) {
            ctx.showMessageWarning(ctx.settingsTxt.value.msgNoDownloadContent);
            return;
        }
        try {
            const fullHash = await calculateHash(content);
            const hash = fullHash.substring(0, 32);
            const blob = new Blob([content], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${hash}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            ctx.showMessageSuccess(ctx.settingsTxt.value.msgDownloadSuccess);
        } catch {
            ctx.showMessageError(ctx.settingsTxt.value.msgDownloadFail);
        }
    };

    // ==================== 页面级 pagehide 草稿持久化 ====================
    const persistDiffDraftOnPageLeave = () => {
        ctx.isTabPageClosing.value = true;
        captureDiffDraftFromEditors();
        void saveDiffDraft('页面离开');
        // pagehide / beforeunload 时尽力（best-effort）同步删除自己的心跳，
        // 这样其他正在运行的 tab 启动 GC 时能立即识别本 tab 已关闭。
        if (typeof window !== 'undefined' && ctx.tabId.value) {
            try {
                const req = indexedDB.open(IDB_DB_NAME, IDB_DB_VERSION);
                req.onsuccess = () => {
                    try {
                        const db = req.result;
                        const tx = db.transaction(IDB_STORE_TAB_HEARTBEATS, 'readwrite');
                        tx.objectStore(IDB_STORE_TAB_HEARTBEATS).delete(ctx.tabId.value);
                    } catch {
                        // 静默失败：进入此分支说明 tab 已经在关闭，下次 GC 会兜底
                    }
                };
            } catch {
                // 忽略
            }
        }
    };

    if (typeof window !== 'undefined') {
        onMounted(() => {
            window.addEventListener('pagehide', persistDiffDraftOnPageLeave);
            window.addEventListener('beforeunload', persistDiffDraftOnPageLeave);
        });
        onBeforeUnmount(() => {
            window.removeEventListener('pagehide', persistDiffDraftOnPageLeave);
            window.removeEventListener('beforeunload', persistDiffDraftOnPageLeave);
        });
    }

    return {
        isDiffMode,
        diffLeftEditorContainer,
        diffRightEditorContainer,
        diffLeftEditorStatus,
        diffRightEditorStatus,

        diffCount,
        activeDiffIndex,
        diffSyncButtons,
        diffDraftLeftText,
        diffDraftRightText,

        enterDiffMode,
        exitDiffMode,

        getDiffLeftEditor,
        getDiffRightEditor,
        getDiffSideEditor,

        handleDiffPaneMounted,

        updateDiffEditorOptions,
        layoutDiffEditors,
        scheduleDiffEditorLayout,
        scheduleDiffRecompute,
        destroyDiffEditor,

        loadDiffDraftSnapshot,
        captureDiffDraftFromEditors,
        saveDiffDraft,

        goToNextDiff,
        goToPrevDiff,
        handleDiffSync,

        diffFormatJSON,
        diffSortJSON,
        diffCopy,
        diffClear,
        diffHandleUpload,
        diffDownload,

        sendContentToDiff,
        sendInputContentToDiff,
        setInputSendToDiffContextKeys,
        clearInputSendToDiffContextKeys,
    };
};
