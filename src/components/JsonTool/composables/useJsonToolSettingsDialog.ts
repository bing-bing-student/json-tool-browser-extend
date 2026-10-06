import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { nextTick, ref, watch, type Ref } from 'vue';

import { JSON_TOOL_EDITOR_HORIZONTAL_SCROLLBAR_THICKNESS } from '../utils/editorScrollbar';
import { getJsonToolLongLineViewOptions } from '../utils/editorWordWrap';
import type { ButtonVisibility } from './useToolSettings';

export interface UseJsonToolSettingsDialogCtx {
    wordWrap: Ref<boolean>;
    fontSize: Ref<number>;
    indentSize: Ref<number>;
    arrayNewLine: Ref<boolean>;
    showMinimap: Ref<boolean>;
    stickyScroll: Ref<boolean>;
    enableDiagnostics: Ref<boolean>;
    preferredStickyScroll: Ref<boolean>;
    preferredEnableDiagnostics: Ref<boolean>;
    buttonVisibility: Ref<ButtonVisibility>;
    selectedLevel: Ref<number>;
    getInputEditor: () => monaco.editor.IStandaloneCodeEditor | null;
    getOutputEditor: () => monaco.editor.IStandaloneCodeEditor | null;
    isDiffMode: Ref<boolean>;
    updateDiffEditorOptions: (options: monaco.editor.IEditorOptions) => void;
    scheduleDiffEditorLayout: () => void;
    scheduleDiffRecompute: () => void;
    updateEditorLayout: () => void;
    configureJsonSchemaSupport: () => void;
    refreshInputEditorErrors: () => void;
    checkToolBarScroll: () => void;
}

export const useJsonToolSettingsDialog = (ctx: UseJsonToolSettingsDialogCtx) => {
    const settingsDialogVisible = ref(false);
    const settingsCollapseActiveNames = ref<string | number>('format');

    const updateWordWrap = () => {
        const singleLineDisplay = ctx.wordWrap.value;
        const options: monaco.editor.IEditorOptions = {
            ...getJsonToolLongLineViewOptions(singleLineDisplay),
            padding: { bottom: 0 },
            scrollbar: {
                horizontal: 'auto' as const,
                horizontalScrollbarSize: JSON_TOOL_EDITOR_HORIZONTAL_SCROLLBAR_THICKNESS,
                horizontalSliderSize: JSON_TOOL_EDITOR_HORIZONTAL_SCROLLBAR_THICKNESS,
                ignoreHorizontalScrollbarInContentHeight: true,
            },
        };

        ctx.getInputEditor()?.updateOptions(options);
        ctx.getOutputEditor()?.updateOptions(options);
        ctx.updateDiffEditorOptions(options);

        nextTick(() => {
            ctx.updateEditorLayout();
            ctx.scheduleDiffEditorLayout();
            ctx.scheduleDiffRecompute();
        });
    };

    const updateFontSize = () => {
        const options = {
            fontSize: ctx.fontSize.value,
        };

        ctx.getInputEditor()?.updateOptions(options);
        ctx.getOutputEditor()?.updateOptions(options);
        ctx.updateDiffEditorOptions(options);

        nextTick(() => {
            ctx.scheduleDiffEditorLayout();
            ctx.scheduleDiffRecompute();
        });
    };

    const updateMinimap = () => {
        const options = {
            minimap: { enabled: ctx.showMinimap.value },
        };

        ctx.getInputEditor()?.updateOptions(options);
        ctx.getOutputEditor()?.updateOptions(options);
        ctx.updateDiffEditorOptions(options);
    };

    const updateStickyScroll = () => {
        const options = {
            stickyScroll: { enabled: ctx.stickyScroll.value },
        };

        ctx.getInputEditor()?.updateOptions(options);
        ctx.getOutputEditor()?.updateOptions(options);
    };

    const openSettingsDialog = () => {
        settingsDialogVisible.value = true;
        if (ctx.isDiffMode.value && ['unescape', 'archive'].includes(String(settingsCollapseActiveNames.value))) {
            settingsCollapseActiveNames.value = 'format';
            return;
        }
        settingsCollapseActiveNames.value = 'format';
    };

    watch(ctx.showMinimap, () => {
        updateMinimap();
    });

    watch(ctx.stickyScroll, () => {
        updateStickyScroll();
    });

    watch(ctx.stickyScroll, (value) => {
        ctx.preferredStickyScroll.value = value;
    });

    watch(ctx.enableDiagnostics, () => {
        ctx.configureJsonSchemaSupport();
        ctx.refreshInputEditorErrors();
    });

    watch(ctx.enableDiagnostics, (value) => {
        ctx.preferredEnableDiagnostics.value = value;
    });

    watch([ctx.indentSize, ctx.arrayNewLine], () => {
        if (!ctx.getInputEditor()?.getValue()?.trim()) {
            ctx.selectedLevel.value = 0;
            return;
        }
        try {
            JSON.parse(ctx.getInputEditor()?.getValue() || '');
        } catch {
            // 解析失败不做处理
        }
    });

    watch(
        () => ctx.buttonVisibility.value.format,
        (newVal) => {
            if (!newVal) {
                ctx.buttonVisibility.value.format = true;
            }
        },
        { immediate: true },
    );

    watch(
        () => ctx.buttonVisibility.value.collapse,
        (newVal) => {
            if (!newVal) {
                ctx.buttonVisibility.value.collapse = true;
            }
        },
        { immediate: true },
    );

    watch(
        () => ctx.buttonVisibility.value.fullscreen,
        (newVal) => {
            if (!newVal) {
                ctx.buttonVisibility.value.fullscreen = true;
            }
        },
        { immediate: true },
    );

    watch(
        () => ctx.buttonVisibility.value,
        () => {
            ctx.checkToolBarScroll();
        },
        { deep: true },
    );

    return {
        settingsDialogVisible,
        settingsCollapseActiveNames,
        updateWordWrap,
        updateFontSize,
        updateMinimap,
        updateStickyScroll,
        openSettingsDialog,
    };
};

export type UseJsonToolSettingsDialogReturn = ReturnType<typeof useJsonToolSettingsDialog>;
