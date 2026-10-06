import { nextTick, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue';
import { formatFileSize } from '../utils/byteUtils';
import { measureTextWidth } from '../utils/common';
import { IDB_STORE_ARCHIVES, idbGet, idbPut } from '../utils/idb';
import type { SettingsTxt } from '../utils/i18n';
import { showMessageError } from '@/utils/jsonToolMessage';

export const MAX_ARCHIVE_COUNT = 30;

export interface JsonArchive {
    id: string;
    name: string;
    size: number;
    content: string;
}

interface ArchiveBucketRecord {
    tabId: string;
    archives: JsonArchive[];
    updatedAt: number;
    version: number;
}

interface UseJsonArchivesOptions {
    tabId: Ref<string>;
    settingsTxt: ComputedRef<SettingsTxt>;
    inputEditorContainer: Ref<HTMLElement | null>;
    updateEditorLayouts: (force?: boolean) => void;
}

const ARCHIVE_SIDEBAR_HORIZONTAL_PADDING = 10;
const ARCHIVE_ITEM_HORIZONTAL_PADDING = 8;
const ARCHIVE_COLLAPSED_NAME_MAX_CHARS = 6;

/**
 * 管理 JSON 存档的标签页隔离存储、选择/拖拽状态及侧边栏尺寸。
 * options 提供当前标签页、文案、编辑器容器和布局回调；返回存档状态、持久化方法与侧栏交互方法。
 */
export const useJsonArchives = (options: UseJsonArchivesOptions) => {
    const archives = ref<JsonArchive[]>([]);
    const activeArchiveId = ref<string | null>(null);
    const draggingArchiveId = ref<string | null>(null);
    const dragOverArchiveId = ref<string | null>(null);
    const dragEnabledArchiveId = ref<string | null>(null);
    const dropIndicatorIndex = ref<number | null>(null);
    const archiveListRef = ref<HTMLElement | null>(null);

    const archiveSidebarWidth = ref(150);
    const isArchiveResizing = ref(false);
    let resizeState: {
        initialX: number;
        initialWidth: number;
        minWidth: number;
        maxWidth: number;
    } | null = null;
    let layoutFrame: number | null = null;

    /** 从当前标签页的 IndexedDB 存储桶读取存档；无输入参数，失败时清空列表并提示。 */
    const loadArchives = async (): Promise<void> => {
        if (typeof window === 'undefined') return;
        try {
            const record = await idbGet<ArchiveBucketRecord>(IDB_STORE_ARCHIVES, options.tabId.value);
            archives.value = Array.isArray(record?.archives) ? record.archives : [];
        } catch (error: any) {
            archives.value = [];
            showMessageError(options.settingsTxt.value.msgArchiveLoadFail(error?.message ?? String(error)));
        }
    };

    /**
     * 把当前存档快照写入 IndexedDB。
     * 无输入参数；成功返回 true，失败提示用户并返回 false，供调用方回滚内存修改。
     */
    const saveArchives = async (): Promise<boolean> => {
        if (typeof window === 'undefined') return true;
        try {
            const plainArchives: JsonArchive[] = archives.value.map(({ id, name, size, content }) => ({
                id,
                name,
                size,
                content,
            }));
            const record: ArchiveBucketRecord = {
                tabId: options.tabId.value,
                archives: plainArchives,
                updatedAt: Date.now(),
                version: 1,
            };
            await idbPut(IDB_STORE_ARCHIVES, record);
            return true;
        } catch (error: any) {
            showMessageError(
                options.settingsTxt.value.msgArchiveSaveFail(
                    error?.message ?? options.settingsTxt.value.msgArchiveStorageError,
                ),
            );
            return false;
        }
    };

    /** 返回用于提示的存档总占用文案；无输入参数。 */
    const getArchivesTotalSizeInfo = (): string => {
        const totalSize = archives.value.reduce((sum, archive) => sum + archive.size, 0);
        return options.settingsTxt.value.archiveUsedSize(formatFileSize(totalSize));
    };

    /** 计算侧边栏允许的最小宽度；无输入参数，返回像素值。 */
    const calculateArchiveMinWidth = (): number => 72;

    const calculateArchiveMaxWidth = (): number => {
        if (archives.value.length === 0) return 100;
        const itemMargin = 4;
        let maxWidth = 0;
        for (const item of archives.value) {
            const totalWidth =
                ARCHIVE_SIDEBAR_HORIZONTAL_PADDING +
                ARCHIVE_ITEM_HORIZONTAL_PADDING +
                measureTextWidth(item.name || '') +
                itemMargin;
            maxWidth = Math.max(maxWidth, totalWidth);
        }
        return Math.ceil(maxWidth) + 8;
    };

    /** 计算侧栏头部按钮间距；无输入参数，返回像素值。 */
    const getArchiveHeaderGap = (): number => {
        const extraWidth = Math.max(0, archiveSidebarWidth.value - calculateArchiveMinWidth());
        return Math.min(12, Number((extraWidth * 0.3).toFixed(1)));
    };

    /**
     * 根据当前侧栏宽度生成存档名缩略文本。
     * name 是完整存档名；返回能够放入当前宽度的 Unicode 安全文本。
     */
    const getCollapsedArchiveName = (name: string): string => {
        if (!name) return '##';
        const availableWidth = Math.max(
            16,
            archiveSidebarWidth.value -
                ARCHIVE_SIDEBAR_HORIZONTAL_PADDING -
                ARCHIVE_ITEM_HORIZONTAL_PADDING -
                2,
        );
        let display = '';
        let visibleChars = 0;
        for (const char of Array.from(name)) {
            const next = display + char;
            if (measureTextWidth(next) > availableWidth) break;
            display = next;
            visibleChars++;
            if (visibleChars >= ARCHIVE_COLLAPSED_NAME_MAX_CHARS) break;
        }
        return display || Array.from(name)[0] || '##';
    };

    const initializeSidebarWidth = () => {
        archiveSidebarWidth.value = archives.value.length === 0 ? 100 : calculateArchiveMinWidth();
    };

    watch(
        () => archives.value.length,
        (newLength, oldLength) => {
            if (newLength <= 0) return;
            if (!oldLength) {
                initializeSidebarWidth();
                return;
            }
            const currentMax = Math.max(calculateArchiveMaxWidth(), calculateArchiveMinWidth());
            if (archiveSidebarWidth.value < calculateArchiveMinWidth()) initializeSidebarWidth();
            if (archiveSidebarWidth.value > currentMax) archiveSidebarWidth.value = currentMax;
        },
        { immediate: true },
    );

    watch(
        () => archives.value.map((archive) => archive.name),
        () => {
            if (archives.value.length === 0) return;
            const currentMax = Math.max(calculateArchiveMaxWidth(), calculateArchiveMinWidth());
            if (archiveSidebarWidth.value > currentMax) archiveSidebarWidth.value = currentMax;
        },
        { deep: true },
    );

    watch(
        () => archives.value.map((archive) => archive.id),
        () => {
            if (activeArchiveId.value && !archives.value.some((item) => item.id === activeArchiveId.value)) {
                activeArchiveId.value = null;
            }
        },
        { deep: true },
    );

    const handleArchiveResizeMove = (event: MouseEvent | TouchEvent) => {
        if (!isArchiveResizing.value || !resizeState) return;
        const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
        const newWidth = resizeState.initialWidth + clientX - resizeState.initialX;
        archiveSidebarWidth.value = Math.max(resizeState.minWidth, Math.min(newWidth, resizeState.maxWidth));
        if (layoutFrame === null) {
            layoutFrame = requestAnimationFrame(() => {
                layoutFrame = null;
                options.updateEditorLayouts(true);
            });
        }
    };

    /** 停止侧边栏宽度拖动并清理全局监听；无输入参数，也不返回结果。 */
    const stopArchiveResize = () => {
        if (!isArchiveResizing.value) return;
        isArchiveResizing.value = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        resizeState = null;

        const sidebar = document.querySelector<HTMLElement>('.archive-sidebar');
        if (sidebar) sidebar.style.transition = '';
        if (layoutFrame !== null) {
            cancelAnimationFrame(layoutFrame);
            layoutFrame = null;
        }
        nextTick(() => options.updateEditorLayouts(true));
        document.removeEventListener('mousemove', handleArchiveResizeMove);
        document.removeEventListener('mouseup', stopArchiveResize);
        document.removeEventListener('touchmove', handleArchiveResizeMove);
        document.removeEventListener('touchend', stopArchiveResize);
    };

    /**
     * 开始拖动存档侧边栏。
     * event 是鼠标或触摸起始事件；函数设置拖动边界并绑定临时全局监听。
     */
    const startArchiveResize = (event: MouseEvent | TouchEvent) => {
        if (!('touches' in event)) event.preventDefault();
        event.stopPropagation();
        isArchiveResizing.value = true;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';

        const sidebar = document.querySelector<HTMLElement>('.archive-sidebar');
        if (sidebar) sidebar.style.transition = 'none';
        const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
        resizeState = {
            initialX: clientX,
            initialWidth: archiveSidebarWidth.value,
            minWidth: calculateArchiveMinWidth(),
            maxWidth: calculateArchiveMaxWidth(),
        };
        document.addEventListener('mousemove', handleArchiveResizeMove);
        document.addEventListener('mouseup', stopArchiveResize);
        document.addEventListener('touchmove', handleArchiveResizeMove);
        document.addEventListener('touchend', stopArchiveResize);
    };

    /** 允许指定存档从按下动作进入可拖动状态；id 是存档 ID，event 是鼠标或触摸事件。 */
    const onArchivePressStart = (id: string, event: MouseEvent | TouchEvent) => {
        if ('button' in event && event.button !== 0) return;
        dragEnabledArchiveId.value = id;
    };

    const resetArchiveDragState = () => {
        draggingArchiveId.value = null;
        dragOverArchiveId.value = null;
        dragEnabledArchiveId.value = null;
        dropIndicatorIndex.value = null;
        options.inputEditorContainer.value?.classList.remove('drag-over-archive');
    };

    /** 启动存档排序拖拽；item 是源存档，event 用于写入拖拽数据和效果。 */
    const onArchiveDragStart = (item: JsonArchive, event: DragEvent) => {
        if (dragEnabledArchiveId.value !== item.id) {
            event.preventDefault();
            return;
        }
        draggingArchiveId.value = item.id;
        dragOverArchiveId.value = null;
        event.dataTransfer?.setData('application/json-archive', JSON.stringify({ id: item.id, type: 'archive' }));
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
    };

    /** 标记当前进入的目标存档；targetId 是目标 ID。 */
    const onArchiveDragEnter = (targetId: string) => {
        if (!draggingArchiveId.value || draggingArchiveId.value === targetId) return;
        dragOverArchiveId.value = targetId;
    };

    const computeDropIndex = (clientY: number): number => {
        const listElement = archiveListRef.value;
        if (!listElement) return archives.value.length;
        const items = Array.from(listElement.querySelectorAll<HTMLElement>('.archive-item'));
        if (!items.length) return 0;
        for (let index = 0; index < items.length; index++) {
            const rect = items[index].getBoundingClientRect();
            if (clientY < rect.top + rect.height / 2) return index;
        }
        return items.length;
    };

    /**
     * 更新存档项上方的拖放指示线。
     * event 提供指针位置，targetId 是命中的存档 ID；targetIndex 仅保留模板调用兼容性。
     */
    const onArchiveDragOver = (event: DragEvent, targetId: string, _targetIndex: number) => {
        if (!draggingArchiveId.value) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        const elementBelow = document.elementFromPoint(event.clientX, event.clientY);
        if (!elementBelow || !archiveListRef.value || !elementBelow.closest('.archive-item')) {
            dropIndicatorIndex.value = null;
            return;
        }
        dropIndicatorIndex.value = computeDropIndex(event.clientY);
        dragOverArchiveId.value = targetId;
    };

    /** 处理列表区域拖拽移动；event 用来定位插入位置。 */
    const onArchiveListDragOver = (event: DragEvent) => {
        if (!draggingArchiveId.value) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        const elementBelow = document.elementFromPoint(event.clientX, event.clientY);
        if (!elementBelow || !elementBelow.closest('.archive-item')) {
            dropIndicatorIndex.value = null;
            return;
        }
        dropIndicatorIndex.value = computeDropIndex(event.clientY);
    };

    const moveArchive = async (sourceId: string, targetIndex: number) => {
        const sourceIndex = archives.value.findIndex((archive) => archive.id === sourceId);
        if (sourceIndex === -1 || targetIndex < 0) return;

        const [moved] = archives.value.splice(sourceIndex, 1);
        let insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
        insertIndex = Math.max(0, Math.min(insertIndex, archives.value.length));
        archives.value.splice(insertIndex, 0, moved);

        if (!(await saveArchives())) {
            archives.value.splice(insertIndex, 1);
            archives.value.splice(sourceIndex, 0, moved);
        }
    };

    /** 在存档列表区域完成拖放并持久化新顺序；event 提供最终插入位置。 */
    const onArchiveListDrop = async (event: DragEvent) => {
        const sourceId = draggingArchiveId.value;
        const elementBelow = document.elementFromPoint(event.clientX, event.clientY);
        if (!sourceId || !elementBelow || !elementBelow.closest('.archive-item')) {
            resetArchiveDragState();
            return;
        }
        const targetIndex = computeDropIndex(event.clientY);
        dropIndicatorIndex.value = targetIndex;
        await moveArchive(sourceId, targetIndex);
        resetArchiveDragState();
    };

    /**
     * 在指定存档项上完成拖放并持久化顺序。
     * targetId 是目标存档 ID；event 可选，用于更精确地计算插入位置。
     */
    const onArchiveDrop = async (targetId: string, event?: DragEvent) => {
        const sourceId = draggingArchiveId.value;
        if (!sourceId || sourceId === targetId) {
            resetArchiveDragState();
            return;
        }
        const targetIndex =
            dropIndicatorIndex.value ??
            (event ? computeDropIndex(event.clientY) : archives.value.findIndex((archive) => archive.id === targetId));
        await moveArchive(sourceId, targetIndex);
        resetArchiveDragState();
    };

    /** 结束存档拖拽并恢复页面选择与鼠标样式；无输入参数。 */
    const onArchiveDragEnd = () => {
        resetArchiveDragState();
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
    };

    onBeforeUnmount(() => {
        stopArchiveResize();
        onArchiveDragEnd();
    });

    return {
        archives,
        activeArchiveId,
        draggingArchiveId,
        dragOverArchiveId,
        dragEnabledArchiveId,
        dropIndicatorIndex,
        archiveListRef,
        archiveSidebarWidth,
        isArchiveResizing,
        loadArchives,
        saveArchives,
        getArchivesTotalSizeInfo,
        calculateArchiveMinWidth,
        getArchiveHeaderGap,
        getCollapsedArchiveName,
        startArchiveResize,
        stopArchiveResize,
        onArchivePressStart,
        onArchiveDragStart,
        onArchiveDragEnter,
        onArchiveDragOver,
        onArchiveListDragOver,
        onArchiveListDrop,
        onArchiveDrop,
        onArchiveDragEnd,
    };
};
