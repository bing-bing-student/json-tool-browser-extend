// 工具设置（settings）持久化与自动保存 composable
//
// 集中管理 JsonTool 中所有写入 localStorage 的用户偏好：
// - 字段默认值集中在 defaultSettings；
// - loadSettings 在创建时读取 localStorage 并与默认值合并；
// - saveSettings 在初始化阶段（isInitializing）抑制写入，避免 watch 触发的早期噪声；
// - 一个 deep watch 监听所有字段，发生变化时自动调用 saveSettings；
// - 暴露 markInitialized() 给 onMounted 末尾调用，正式开启持久化。

import { ref, watch, type Ref } from 'vue';

const SETTINGS_STORAGE_KEY = 'json-tool-settings';

export type SortMethod = 'dictionary' | 'length' | 'field';
export type SortOrder = 'asc' | 'desc';
export type JsonToolThemeMode = 'light' | 'dark';

export interface ButtonVisibility {
    compress: boolean;
    escape: boolean;
    unescape: boolean;
    dataConvert: boolean;
    masking: boolean;
    sort: boolean;
    archive: boolean;
    diff: boolean;
    format?: boolean;
    collapse?: boolean;
}

export interface PersistedSettings {
    buttonVisibility: ButtonVisibility;
    recursiveUnescape: boolean;
    wordWrap: boolean;
    fontSize: number;
    syncScrollEnabled: boolean;
    showMinimap: boolean;
    enableDiagnostics: boolean;
    indentSize: number;
    encodingMode: boolean;
    arrayNewLine: boolean;
    sortMethod: SortMethod;
    sortOrder: SortOrder;
    diffSortArrays: boolean;
    customArchiveName: boolean;
    stickyScroll: boolean;
    themeMode: JsonToolThemeMode;
}

const defaultSettings: PersistedSettings = {
    buttonVisibility: {
        compress: true,
        escape: true,
        unescape: true,
        dataConvert: true,
        masking: true,
        sort: true,
        archive: true,
        diff: true,
    },
    recursiveUnescape: true,
    wordWrap: true,
    fontSize: 12,
    syncScrollEnabled: true,
    showMinimap: false,
    enableDiagnostics: true,
    indentSize: 2,
    encodingMode: false,
    arrayNewLine: true,
    sortMethod: 'dictionary',
    sortOrder: 'asc',
    diffSortArrays: false,
    customArchiveName: false,
    stickyScroll: false,
    themeMode: 'light',
};

const loadSettingsFromStorage = (): PersistedSettings => {
    if (typeof window === 'undefined') return defaultSettings;
    try {
        const parsed = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || 'null');
        if (parsed) {
            // 只读取当前支持的设置，旧版本中已删除的字段不再参与运行或保存。
            const currentSettings = Object.fromEntries(
                Object.entries(parsed).filter(([key]) => Object.hasOwn(defaultSettings, key)),
            );
            return {
                ...defaultSettings,
                ...currentSettings,
                buttonVisibility: {
                    ...defaultSettings.buttonVisibility,
                    ...Object.fromEntries(
                        Object.entries(parsed.buttonVisibility ?? {}).filter(
                            ([key]) => Object.hasOwn(defaultSettings.buttonVisibility, key) || key === 'format' || key === 'collapse',
                        ),
                    ),
                },
            };
        }
    } catch {
        // 解析失败时使用默认设置
    }
    return defaultSettings;
};

export interface UseToolSettingsReturn {
    // 持久化设置 ref
    indentSize: Ref<number>;
    recursiveUnescape: Ref<boolean>;
    wordWrap: Ref<boolean>;
    fontSize: Ref<number>;
    arrayNewLine: Ref<boolean>;
    showMinimap: Ref<boolean>;
    enableDiagnostics: Ref<boolean>;
    preferredEnableDiagnostics: Ref<boolean>;
    encodingMode: Ref<boolean>;
    sortMethod: Ref<SortMethod>;
    sortOrder: Ref<SortOrder>;
    diffSortArrays: Ref<boolean>;
    customArchiveName: Ref<boolean>;
    stickyScroll: Ref<boolean>;
    preferredStickyScroll: Ref<boolean>;
    themeMode: Ref<JsonToolThemeMode>;
    buttonVisibility: Ref<ButtonVisibility>;
    syncScrollEnabled: Ref<boolean>;
    /** 始终保持数字字面量，保证无损格式化（禁止用户关闭） */
    preserveNumberLiterals: { readonly value: true };

    /** onMounted 末尾调用，结束初始化抑制并允许持久化 */
    markInitialized: () => void;
    /** 手动触发保存（一般无需调用，watch 会自动保存） */
    saveSettings: () => void;
}

export const useToolSettings = (): UseToolSettingsReturn => {
    const savedSettings = loadSettingsFromStorage();
    let isInitializing = true;

    const indentSize = ref(savedSettings.indentSize);
    const recursiveUnescape = ref(savedSettings.recursiveUnescape ?? true);
    const wordWrap = ref(savedSettings.wordWrap);
    const fontSize = ref(savedSettings.fontSize || 12);
    const arrayNewLine = ref(savedSettings.arrayNewLine);
    const preserveNumberLiterals = { value: true } as const;
    const showMinimap = ref(savedSettings.showMinimap ?? false);
    const enableDiagnostics = ref(savedSettings.enableDiagnostics ?? true);
    const preferredEnableDiagnostics = ref(enableDiagnostics.value);
    const encodingMode = ref(savedSettings.encodingMode ?? false);
    const sortMethod = ref<SortMethod>(savedSettings.sortMethod);
    const sortOrder = ref<SortOrder>(savedSettings.sortOrder);
    const diffSortArrays = ref(savedSettings.diffSortArrays ?? false);
    const customArchiveName = ref<boolean>(savedSettings.customArchiveName ?? false);
    const stickyScroll = ref(savedSettings.stickyScroll ?? true);
    const preferredStickyScroll = ref(stickyScroll.value);
    const themeMode = ref<JsonToolThemeMode>(savedSettings.themeMode === 'dark' ? 'dark' : 'light');
    const buttonVisibility = ref<ButtonVisibility>(savedSettings.buttonVisibility);
    const syncScrollEnabled = ref(savedSettings.syncScrollEnabled ?? false);

    const saveSettings = () => {
        if (typeof window === 'undefined' || isInitializing) return;
        const settingsToSave: PersistedSettings = {
            buttonVisibility: buttonVisibility.value,
            recursiveUnescape: recursiveUnescape.value,
            wordWrap: wordWrap.value,
            fontSize: fontSize.value,
            syncScrollEnabled: syncScrollEnabled.value,
            showMinimap: showMinimap.value,
            enableDiagnostics: preferredEnableDiagnostics.value,
            indentSize: indentSize.value,
            encodingMode: encodingMode.value,
            arrayNewLine: arrayNewLine.value,
            sortMethod: sortMethod.value,
            sortOrder: sortOrder.value,
            diffSortArrays: diffSortArrays.value,
            customArchiveName: customArchiveName.value,
            stickyScroll: preferredStickyScroll.value,
            themeMode: themeMode.value,
        };
        try {
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settingsToSave));
        } catch {
            // localStorage 写入失败时静默忽略（如隐私模式 / 容量超限）
        }
    };

    // 监听所有设置变化并自动保存
    watch(
        () => [
            buttonVisibility.value,
            recursiveUnescape.value,
            wordWrap.value,
            fontSize.value,
            syncScrollEnabled.value,
            showMinimap.value,
            enableDiagnostics.value,
            indentSize.value,
            encodingMode.value,
            arrayNewLine.value,
            preserveNumberLiterals.value,
            sortMethod.value,
            sortOrder.value,
            diffSortArrays.value,
            customArchiveName.value,
            stickyScroll.value,
            themeMode.value,
        ],
        () => {
            saveSettings();
        },
        { deep: true },
    );

    const markInitialized = () => {
        isInitializing = false;
    };

    return {
        indentSize,
        recursiveUnescape,
        wordWrap,
        fontSize,
        arrayNewLine,
        showMinimap,
        enableDiagnostics,
        preferredEnableDiagnostics,
        encodingMode,
        sortMethod,
        sortOrder,
        diffSortArrays,
        customArchiveName,
        stickyScroll,
        preferredStickyScroll,
        themeMode,
        buttonVisibility,
        syncScrollEnabled,
        preserveNumberLiterals,
        markInitialized,
        saveSettings,
    };
};
