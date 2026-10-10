<template>
    <!-- 三列 flex = 左独立 Monaco + 35px 中间面板 + 右独立 Monaco -->
    <div class="editor-container diff-editor-container">
        <!-- 顶部 header 行 -->
        <div class="diff-row diff-header-row">
            <div class="diff-cell diff-cell-left diff-header-cell">
                <span v-if="comparison" class="repair-side-label">{{ settingsTxt.repairOriginal }}</span>
                <div class="panel-actions diff-panel-actions">
                    <el-button v-if="!comparison" @click="diffMode.diffFormatJSON('left')" size="small" type="primary" plain>
                        <span>{{ settingsTxt.diffPanelFormat }}</span>
                    </el-button>
                    <el-button v-if="!comparison" @click="diffMode.diffSortJSON('left')" size="small" type="primary" plain>
                        <span>{{ settingsTxt.diffPanelSort }}</span>
                    </el-button>
                    <el-button @click="diffMode.diffCopy('left')" size="small" type="success" plain>
                        <span>{{ settingsTxt.diffPanelCopy }}</span>
                    </el-button>
                    <el-button v-if="!comparison" @click="diffMode.diffClear('left')" size="small" type="danger" plain>
                        <span>{{ settingsTxt.diffPanelClear }}</span>
                    </el-button>
                    <el-upload v-if="!comparison" class="upload-json" accept=".json" :auto-upload="false" :show-file-list="false" :on-change="diffMode.diffHandleUpload('left')">
                        <el-button size="small" type="info" plain>
                            <span>{{ settingsTxt.diffPanelUpload }}</span>
                        </el-button>
                    </el-upload>
                    <el-button @click="diffMode.diffDownload('left')" size="small" type="info" plain>
                        <span>{{ settingsTxt.diffPanelDownload }}</span>
                    </el-button>
                </div>
            </div>
            <div class="diff-cell diff-cell-center diff-header-cell"></div>
            <div class="diff-cell diff-cell-right diff-header-cell">
                <span v-if="comparison" class="repair-side-label">{{ settingsTxt.repairResult }}</span>
                <div class="panel-actions diff-panel-actions">
                    <el-button v-if="!comparison" @click="diffMode.diffFormatJSON('right')" size="small" type="primary" plain>
                        <span>{{ settingsTxt.diffPanelFormat }}</span>
                    </el-button>
                    <el-button v-if="!comparison" @click="diffMode.diffSortJSON('right')" size="small" type="primary" plain>
                        <span>{{ settingsTxt.diffPanelSort }}</span>
                    </el-button>
                    <el-button @click="diffMode.diffCopy('right')" size="small" type="success" plain>
                        <span>{{ settingsTxt.diffPanelCopy }}</span>
                    </el-button>
                    <el-button v-if="!comparison" @click="diffMode.diffClear('right')" size="small" type="danger" plain>
                        <span>{{ settingsTxt.diffPanelClear }}</span>
                    </el-button>
                    <el-upload v-if="!comparison" class="upload-json" accept=".json" :auto-upload="false" :show-file-list="false" :on-change="diffMode.diffHandleUpload('right')">
                        <el-button size="small" type="info" plain>
                            <span>{{ settingsTxt.diffPanelUpload }}</span>
                        </el-button>
                    </el-upload>
                    <el-button @click="diffMode.diffDownload('right')" size="small" type="info" plain>
                        <span>{{ settingsTxt.diffPanelDownload }}</span>
                    </el-button>
                </div>
            </div>
        </div>

        <!-- 中部编辑器行：三列 flex，左右各挂独立 Monaco，中间是真实的同步面板 -->
        <div class="diff-row diff-editor-row">
            <div class="diff-cell diff-cell-left diff-editor-host">
                <div :ref="bindLeftHost" class="diff-editor-instance"></div>
            </div>
            <div class="diff-cell diff-cell-center diff-sync-panel">
                <div
                    v-for="btn in (comparison ? [] : diffMode.diffSyncButtons.value)"
                    :key="btn.changeIndex"
                    class="diff-sync-btn-group"
                    :class="{ 'is-active': btn.changeIndex === diffMode.activeDiffIndex.value }"
                    :style="{ top: btn.top + 'px' }">
                    <button
                        class="diff-sync-btn diff-sync-btn-left"
                        :title="settingsTxt.diffSyncTitleLeft"
                        @click="diffMode.handleDiffSync(btn.changeIndex, 'left')">
                        ←
                    </button>
                    <button
                        class="diff-sync-btn diff-sync-btn-right"
                        :title="settingsTxt.diffSyncTitleRight"
                        @click="diffMode.handleDiffSync(btn.changeIndex, 'right')">
                        →
                    </button>
                </div>
            </div>
            <div class="diff-cell diff-cell-right diff-editor-host">
                <div :ref="bindRightHost" class="diff-editor-instance"></div>
            </div>
        </div>

        <!-- 底部 status 行 -->
        <div class="diff-row diff-status-row">
            <div class="diff-cell diff-cell-left editor-status-bar diff-status-bar">
                <span v-if="diffMode.diffLeftEditorStatus.value" class="status-text">
                    {{ diffMode.diffLeftEditorStatus.value }}
                </span>
            </div>
            <div class="diff-cell diff-cell-center diff-status-center"></div>
            <div class="diff-cell diff-cell-right editor-status-bar diff-status-bar">
                <span v-if="diffMode.diffRightEditorStatus.value" class="status-text">
                    {{ diffMode.diffRightEditorStatus.value }}
                </span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ElButton, ElUpload } from 'element-plus';
import 'element-plus/es/components/button/style/css';
import 'element-plus/es/components/upload/style/css';

import { computed, inject, onMounted, type ComponentPublicInstance } from 'vue';

import { DIFF_MODE_INJECTION_KEY, type UseDiffModeReturn } from './composables/useDiffMode';
import type { SettingsTxt } from './utils/i18n';

const props = defineProps<{ settingsTxt: SettingsTxt; comparison?: boolean }>();
const settingsTxt = computed(() => props.settingsTxt);

const injected = inject(DIFF_MODE_INJECTION_KEY);
if (!injected) {
    throw new Error('JsonToolDiffPane: DIFF_MODE_INJECTION_KEY not provided');
}
const diffMode: UseDiffModeReturn = injected;

// Vue 函数 ref：DOM 挂载/卸载时直接同步到 composable 持有的容器 ref
const bindLeftHost = (el: Element | ComponentPublicInstance | null) => {
    diffMode.diffLeftEditorContainer.value = (el instanceof Element ? el : null) as HTMLElement | null;
};
const bindRightHost = (el: Element | ComponentPublicInstance | null) => {
    diffMode.diffRightEditorContainer.value = (el instanceof Element ? el : null) as HTMLElement | null;
};

onMounted(() => {
    // v-if 渲染 .diff-editor-instance 后，bind* 已把容器 ref 设置好；此时安全创建 Monaco
    diffMode.handleDiffPaneMounted();
});
</script>

<style>
.repair-side-label { margin-right: auto; padding: 0 12px; font-weight: 600; white-space: nowrap; }

/* Diff 颜色变量：亮色保持清晰语义，暗色收敛到石墨灰体系内，避免占位块像浅色贴片。 */
.json-tool-root {
    --json-tool-diff-delete-bg: rgba(215, 58, 73, 0.11);
    --json-tool-diff-insert-bg: rgba(102, 184, 255, 0.16);
    --json-tool-diff-inline-delete: rgba(215, 58, 73, 0.26);
    --json-tool-diff-inline-insert: rgba(102, 184, 255, 0.34);
    --json-tool-diff-spacer-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.78);
    --json-tool-diff-spacer-delete-bg: rgba(252, 239, 241, 0.94);
    --json-tool-diff-spacer-delete-stripe: rgba(215, 58, 73, 0.18);
    --json-tool-diff-spacer-insert-bg: rgba(237, 248, 255, 0.96);
    --json-tool-diff-spacer-insert-stripe: rgba(84, 165, 240, 0.16);
    --json-tool-diff-center-bg: #f2f4f7;
    --json-tool-diff-center-border: #dde3ea;
    --json-tool-diff-sync-btn-color: #7b8491;
    --json-tool-diff-sync-btn-hover-color: #4b5563;
    --json-tool-diff-sync-btn-active-color: #d48a12;
}

.json-tool-root.theme-dark {
    --json-tool-diff-delete-bg: rgba(102, 58, 60, 0.26);
    --json-tool-diff-insert-bg: rgba(56, 88, 132, 0.24);
    --json-tool-diff-inline-delete: rgba(134, 68, 72, 0.48);
    --json-tool-diff-inline-insert: rgba(63, 106, 164, 0.5);
    --json-tool-diff-spacer-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
    --json-tool-diff-spacer-delete-bg: rgba(57, 40, 42, 0.92);
    --json-tool-diff-spacer-delete-stripe: rgba(168, 88, 92, 0.2);
    --json-tool-diff-spacer-insert-bg: rgba(38, 48, 63, 0.92);
    --json-tool-diff-spacer-insert-stripe: rgba(97, 145, 209, 0.22);
    --json-tool-diff-center-bg: #20242b;
    --json-tool-diff-center-border: #303743;
    --json-tool-diff-sync-btn-color: #9aa3af;
    --json-tool-diff-sync-btn-hover-color: #d1d5db;
    --json-tool-diff-sync-btn-active-color: #f0b84a;
}

/* ==================== Diff 模式样式 ==================== */
.diff-editor-container {
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
    background: var(--json-tool-surface, #fff);
    border-radius: 4px;
}

.diff-row {
    display: flex;
    min-width: 0;
}

.diff-cell {
    box-sizing: border-box;
    min-width: 0;
    display: flex;
    flex-direction: column;
}

.diff-cell-left,
.diff-cell-right {
    flex: 1 1 0;
    min-width: 0;
}

.diff-cell-center {
    flex: 0 0 35px;
    width: 35px;
    background: var(--json-tool-diff-center-bg, #f7f8fa);
    border-left: 1px solid var(--json-tool-diff-center-border, var(--json-tool-border, #e4e7ed));
    border-right: 1px solid var(--json-tool-diff-center-border, var(--json-tool-border, #e4e7ed));
    position: relative;
}

/* ---------------- 顶部 header 行 ---------------- */
.diff-header-row {
    flex: 0 0 35px;
    height: 35px;
    background: var(--json-tool-surface-header, linear-gradient(to bottom, #fafbfc, #f6f8fa));
    box-sizing: border-box;
}

.diff-header-cell {
    flex-direction: row;
    align-items: center;
    justify-content: center;
    padding: 5px 15px;
    border-bottom: 1px solid var(--json-tool-border, #e4e7ed);
}

.diff-header-cell.diff-cell-center {
    padding: 0;
    border-bottom: none;
}

.diff-panel-actions {
    display: flex;
    gap: 8px;
    opacity: 1;
    pointer-events: auto;
}

.diff-panel-actions .el-button {
    transition: none !important;
    animation: none !important;
}

.diff-panel-actions .el-button + .el-button {
    margin-left: 0 !important;
}

/* ---------------- 中部编辑器行 ---------------- */
.diff-editor-row {
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

.diff-editor-host {
    position: relative;
    overflow: hidden;
}

.diff-editor-instance {
    width: 100%;
    height: 100%;
}

.diff-editor-row .diff-cell-center {
    pointer-events: none;
}

.diff-editor-row .diff-sync-btn-group {
    position: absolute;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: row;
    gap: 0;
    pointer-events: auto;
    z-index: 1;
}

.diff-sync-btn {
    width: 16px;
    height: 18px;
    border: none;
    background: transparent;
    color: var(--json-tool-diff-sync-btn-color, #909399);
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    line-height: 1;
    transition:
        color 0.15s,
        opacity 0.15s;
}

.diff-sync-btn-left,
.diff-sync-btn-right {
    border-radius: 0;
}

.diff-sync-btn:hover {
    color: var(--json-tool-diff-sync-btn-hover-color, #606266);
}

.diff-sync-btn-group.is-active .diff-sync-btn {
    color: var(--json-tool-diff-sync-btn-active-color, #f59e0b);
}

.diff-sync-btn:active {
    opacity: 0.7;
}

.diff-editor-row .diff-line-delete {
    background: var(--json-tool-diff-delete-bg);
}

.diff-editor-row .diff-line-insert {
    background: var(--json-tool-diff-insert-bg);
}

/* ---------------- 当前差异定位标记 ---------------- */
.diff-editor-row .diff-navigation-marker {
    width: 4px;
    pointer-events: none;
    overflow: hidden;
}

.diff-editor-row .diff-navigation-marker-bar {
    width: 100%;
    height: 100%;
    background: #409eff;
    border-radius: 2px;
}

.json-tool-root.theme-dark .diff-navigation-marker-bar {
    background: #79b8ff;
}

.diff-editor-row .diff-navigation-marker[data-side='left'] .diff-navigation-marker-bar {
    background: #f56c6c;
}

.json-tool-root.theme-dark .diff-navigation-marker[data-side='left'] .diff-navigation-marker-bar {
    background: #ff8a8a;
}

/* ---------------- 行内字符级差异高亮 ---------------- */
/* 背景色加深一档，使其在整行底色之上仍清晰可见；不用下划线/删除线，
   避免 JSON 中本身包含的转义字符或路径出现视觉干扰。 */
.diff-editor-row .diff-inline-delete {
    background: var(--json-tool-diff-inline-delete);
    border-radius: 2px;
}

.diff-editor-row .diff-inline-insert {
    background: var(--json-tool-diff-inline-insert);
    border-radius: 2px;
}

/* ---------------- 缺失行占位区 ---------------- */
.diff-editor-row .diff-view-zone-spacer {
    width: 100%;
    box-sizing: border-box;
    box-shadow: var(--json-tool-diff-spacer-shadow);
    /* Keep the hatch in the content area and a plain diff color under the track. */
    background-size:
        calc(100% - var(--json-tool-diff-scrollbar-width, 0px)) 100%,
        calc(100% - var(--json-tool-diff-scrollbar-width, 0px)) 100%,
        var(--json-tool-diff-scrollbar-width, 0px) 100%;
    background-position: left top, left top, right top;
    background-repeat: no-repeat;
}

.diff-editor-row .diff-view-zone-spacer-left {
    background-image: repeating-linear-gradient(
        -45deg,
        var(--json-tool-diff-spacer-delete-stripe) 0,
        var(--json-tool-diff-spacer-delete-stripe) 2px,
        transparent 2px,
        transparent 9px
    ),
    linear-gradient(var(--json-tool-diff-spacer-delete-bg), var(--json-tool-diff-spacer-delete-bg)),
    linear-gradient(var(--json-tool-diff-delete-bg), var(--json-tool-diff-delete-bg));
}

.diff-editor-row .diff-view-zone-spacer-right {
    background-image: repeating-linear-gradient(
        -45deg,
        var(--json-tool-diff-spacer-insert-stripe) 0,
        var(--json-tool-diff-spacer-insert-stripe) 2px,
        transparent 2px,
        transparent 9px
    ),
    linear-gradient(var(--json-tool-diff-spacer-insert-bg), var(--json-tool-diff-spacer-insert-bg)),
    linear-gradient(var(--json-tool-diff-insert-bg), var(--json-tool-diff-insert-bg));
}

/* ---------------- 底部 status 行 ---------------- */
.diff-status-row {
    flex: 0 0 22px;
    min-height: 22px;
}

.diff-status-center {
    border-top: none;
    box-shadow: none;
}

.editor-status-bar {
    height: 22px;
    background: var(--json-tool-surface-status, linear-gradient(to bottom, #fafbfc, #f5f7fa));
    border-top: none;
    display: flex;
    align-items: center;
    padding: 0 10px;
    flex-shrink: 0;
    font-size: 12px;
    color: var(--json-tool-text-muted, #606266);
    box-shadow: 0 -1px 2px rgba(0, 0, 0, 0.02);
}

.editor-status-bar .status-text {
    user-select: none;
    white-space: nowrap;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;
}

.diff-status-bar {
    box-sizing: border-box;
    min-width: 0;
    overflow: hidden;
    flex-direction: row;
    align-items: center;
}
</style>
