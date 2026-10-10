<template>
    <el-dialog
        v-model="visibleModel"
        class="settings-dialog-wrapper"
        :close-on-click-modal="false"
        :show-close="false"
        :align-center="false"
        top="12vh"
        width="850px">
        <template #header>
            <div class="dialog-header-with-close">
                <span class="dialog-title-with-close">{{ settingsTxt.dialogTitle }}</span>
                <button class="demo-close-btn" @click="visibleModel = false" :aria-label="settingsTxt.closeAria">✕</button>
            </div>
        </template>
        <div class="settings-dialog-content">
            <el-collapse v-model="activeNameModel" accordion>
                <!-- 设置 -->
                <el-collapse-item name="settings">
                    <template #title>
                        <div class="settings-collapse-title">
                            <el-icon class="column-title-icon">
                                <Setting />
                            </el-icon>
                            <span>{{ settingsTxt.sectionGeneral }}</span>
                        </div>
                    </template>
                    <div class="settings-collapse-content">
                        <template v-if="!isDiffMode">
                            <!-- 菜单栏功能设置 -->
                            <div class="settings-subsection">
                                <div class="settings-subsection-title">{{ settingsTxt.menuVisibilityTitle }}</div>
                                <div class="button-visibility-list">
                                    <!-- 本地数据处理 -->
                                    <div class="button-visibility-item">
                                        <el-checkbox v-model="buttonVisibilityModel.compress">{{ settingsTxt.btnCompress }}</el-checkbox>
                                    </div>
                                    <div class="button-visibility-item">
                                        <el-checkbox v-model="buttonVisibilityModel.escape">{{ settingsTxt.btnEscape }}</el-checkbox>
                                    </div>
                                    <div class="button-visibility-item">
                                        <el-checkbox v-model="buttonVisibilityModel.unescape">{{ settingsTxt.btnUnescape }}</el-checkbox>
                                    </div>
                                    <div class="button-visibility-item">
                                        <el-checkbox v-model="buttonVisibilityModel.dataConvert">{{ settingsTxt.btnDataConvert }}</el-checkbox>
                                    </div>
                                    <!-- 第二行：数据处理与管理 -->
                                    <div class="button-visibility-item">
                                        <el-checkbox v-model="buttonVisibilityModel.masking">{{ settingsTxt.btnMasking }}</el-checkbox>
                                    </div>
                                    <div class="button-visibility-item">
                                        <el-checkbox v-model="buttonVisibilityModel.sort">{{ settingsTxt.btnSort }}</el-checkbox>
                                    </div>
                                    <div class="button-visibility-item">
                                        <el-checkbox v-model="buttonVisibilityModel.archive">{{ settingsTxt.btnArchive }}</el-checkbox>
                                    </div>
                                    <div class="button-visibility-item">
                                        <el-checkbox v-model="buttonVisibilityModel.diff">{{ settingsTxt.btnDiff }}</el-checkbox>
                                    </div>
                                </div>
                            </div>

                        </template>

                        <div class="settings-switch-grid settings-switch-grid--values">
                            <div class="switch-card">
                                <div class="switch-card-head">
                                    <span class="switch-card-title">{{ settingsTxt.fontSizeTitleValue(fontSizeModel) }}</span>
                                    <el-radio-group v-model="fontSizeModel" class="switch-card-radio-group" @change="$emit('updateFontSize')">
                                        <el-radio :value="12" border>12</el-radio>
                                        <el-radio :value="13" border>13</el-radio>
                                        <el-radio :value="14" border>14</el-radio>
                                    </el-radio-group>
                                </div>
                                <span class="switch-card-desc">{{ settingsTxt.fontSizeStaticDesc }}</span>
                            </div>

                            <!-- 缩进空格 -->
                            <div class="switch-card">
                                <div class="switch-card-head">
                                    <span class="switch-card-title">{{ settingsTxt.indentTitleValue(indentSizeModel) }}</span>
                                    <el-radio-group v-model="indentSizeModel" class="switch-card-radio-group">
                                        <el-radio :value="2" border>2</el-radio>
                                        <el-radio :value="4" border>4</el-radio>
                                        <el-radio :value="8" border>8</el-radio>
                                    </el-radio-group>
                                </div>
                                <span class="switch-card-desc">{{ settingsTxt.indentStaticDesc }}</span>
                            </div>
                        </div>

                        <!-- 开关项集合：统一以 2 列紧凑网格呈现 -->
                        <div class="settings-switch-grid settings-switch-grid--toggles">
                            <!-- 语法检查 -->
                            <div class="switch-card">
                                <div class="switch-card-head">
                                    <span class="switch-card-title">
                                        {{ enableDiagnosticsModel ? settingsTxt.diagnosticsTitleOn : settingsTxt.diagnosticsTitleOff }}
                                    </span>
                                    <el-switch class="switch-card-toggle" v-model="enableDiagnosticsModel" size="default" />
                                </div>
                                <span class="switch-card-desc">{{ settingsTxt.diagnosticsStaticDesc }}</span>
                            </div>

                            <!-- 字符串换行 -->
                            <div class="switch-card">
                                <div class="switch-card-head">
                                    <span class="switch-card-title">
                                        {{ wordWrapLocked ? settingsTxt.wordWrapTitleForced : wordWrapModel ? settingsTxt.wordWrapTitleOff : settingsTxt.wordWrapTitleOn }}
                                    </span>
                                    <el-switch
                                        class="switch-card-toggle"
                                        v-model="wordWrapModel"
                                        :inactive-value="true"
                                        :active-value="false"
                                        :disabled="wordWrapLocked"
                                        size="default"
                                        @change="$emit('updateWordWrap')" />
                                </div>
                                <span class="switch-card-desc">{{ wordWrapLocked ? settingsTxt.wordWrapLockedDesc : settingsTxt.wordWrapStaticDesc }}</span>
                            </div>

                            <!-- 同步滚动（仅普通模式） -->
                            <div v-if="!isDiffMode" class="switch-card">
                                <div class="switch-card-head">
                                    <span class="switch-card-title">
                                        {{ syncScrollEnabledModel ? settingsTxt.syncScrollTitleOn : settingsTxt.syncScrollTitleOff }}
                                    </span>
                                    <el-switch class="switch-card-toggle" v-model="syncScrollEnabledModel" size="default" />
                                </div>
                                <span class="switch-card-desc">{{ settingsTxt.syncScrollStaticDesc }}</span>
                            </div>

                            <!-- 粘性滚动（仅普通模式） -->
                            <div v-if="!isDiffMode" class="switch-card">
                                <div class="switch-card-head">
                                    <span class="switch-card-title">
                                        {{ stickyScrollModel ? settingsTxt.stickyScrollTitleOn : settingsTxt.stickyScrollTitleOff }}
                                    </span>
                                    <el-switch class="switch-card-toggle" v-model="stickyScrollModel" size="default" @change="$emit('updateStickyScroll')" />
                                </div>
                                <span class="switch-card-desc">{{ settingsTxt.stickyScrollStaticDesc }}</span>
                            </div>

                            <!-- 缩略图（仅普通模式） -->
                            <div v-if="!isDiffMode" class="switch-card">
                                <div class="switch-card-head">
                                    <span class="switch-card-title">{{ showMinimapModel ? settingsTxt.minimapTitleOn : settingsTxt.minimapTitleOff }}</span>
                                    <el-switch class="switch-card-toggle" v-model="showMinimapModel" size="default" @change="$emit('updateMinimap')" />
                                </div>
                                <span class="switch-card-desc">{{ settingsTxt.minimapStaticDesc }}</span>
                            </div>
                        </div>
                    </div>
                </el-collapse-item>

                <!-- 格式化设置 -->
                <el-collapse-item name="format">
                    <template #title>
                        <div class="settings-collapse-title">
                            <el-icon class="column-title-icon">
                                <Document />
                            </el-icon>
                            <span>{{ settingsTxt.sectionFormat }}</span>
                        </div>
                    </template>
                    <div class="settings-collapse-content">
                        <div class="settings-switch-grid">
                            <div v-if="!isDiffMode" class="switch-card">
                                <div class="switch-card-head">
                                    <span class="switch-card-title">{{ repairOnFormatModel ? settingsTxt.repairSettingTitleOn : settingsTxt.repairSettingTitleOff }}</span>
                                    <el-switch class="switch-card-toggle" v-model="repairOnFormatModel" />
                                </div>
                                <span class="switch-card-desc">{{ settingsTxt.repairSettingDesc }}</span>
                            </div>
                            <!-- 自动解码 -->
                            <div class="switch-card">
                                <div class="switch-card-head">
                                    <span class="switch-card-title">{{ encodingModeModel ? settingsTxt.encodingTitleOn : settingsTxt.encodingTitleOff }}</span>
                                    <el-switch class="switch-card-toggle" v-model="encodingModeModel" size="default" />
                                </div>
                                <span class="switch-card-desc">{{ settingsTxt.encodingStaticDesc }}</span>
                            </div>

                            <!-- 数组样式 -->
                            <div class="switch-card">
                                <div class="switch-card-head">
                                    <span class="switch-card-title">
                                        {{ arrayNewLineModel ? settingsTxt.arrayStyleTitleOn : settingsTxt.arrayStyleTitleOff }}
                                    </span>
                                    <el-switch class="switch-card-toggle" v-model="arrayNewLineModel" size="default" />
                                </div>
                                <span class="switch-card-desc">{{ settingsTxt.arrayStyleStaticDesc }}</span>
                            </div>
                        </div>
                    </div>
                </el-collapse-item>

                <!-- 去除转义设置 -->
                <el-collapse-item v-if="!isDiffMode" name="unescape">
                    <template #title>
                        <div class="settings-collapse-title">
                            <el-icon class="column-title-icon">
                                <Refresh />
                            </el-icon>
                            <span>{{ settingsTxt.sectionUnescape }}</span>
                        </div>
                    </template>
                    <div class="settings-collapse-content">
                        <div class="settings-switch-grid">
                            <!-- 处理模式（递归 / 仅外层） -->
                            <div class="switch-card">
                                <div class="switch-card-head">
                                    <span class="switch-card-title">
                                        {{ recursiveUnescapeModel ? settingsTxt.unescapeTitleRecursive : settingsTxt.unescapeTitleShallow }}
                                    </span>
                                    <el-switch class="switch-card-toggle" v-model="recursiveUnescapeModel" size="default" />
                                </div>
                                <span class="switch-card-desc">{{ settingsTxt.unescapeStaticDesc }}</span>
                            </div>
                        </div>
                    </div>
                </el-collapse-item>

                <!-- 排序设置 -->
                <el-collapse-item name="sort">
                    <template #title>
                        <div class="settings-collapse-title">
                            <el-icon class="column-title-icon">
                                <Sort />
                            </el-icon>
                            <span>{{ settingsTxt.sectionSort }}</span>
                        </div>
                    </template>
                    <div class="settings-collapse-content">
                        <div v-if="isDiffMode" class="settings-switch-grid">
                            <!-- Diff 模式数组排序 -->
                            <div class="switch-card">
                                <div class="switch-card-head">
                                    <span class="switch-card-title">
                                        {{ diffSortArraysModel ? settingsTxt.diffSortArraysTitleOn : settingsTxt.diffSortArraysTitleOff }}
                                    </span>
                                    <el-switch class="switch-card-toggle" v-model="diffSortArraysModel" size="default" />
                                </div>
                                <span class="switch-card-desc">{{ settingsTxt.diffSortArraysStaticDesc }}</span>
                            </div>

                            <!-- 排序方向（与普通模式共用） -->
                            <div class="switch-card switch-card--wide">
                                <div class="switch-card-head">
                                    <span class="switch-card-title">{{ settingsTxt.sortOrderLabel }}</span>
                                    <el-radio-group v-model="sortOrderModel" class="switch-card-radio-group">
                                        <el-radio value="asc" border>{{ settingsTxt.sortOrderAsc }}</el-radio>
                                        <el-radio value="desc" border>{{ settingsTxt.sortOrderDesc }}</el-radio>
                                    </el-radio-group>
                                </div>
                                <span class="switch-card-desc">{{ settingsTxt.diffSortOrderStaticDesc }}</span>
                            </div>
                        </div>
                        <div v-else class="settings-switch-grid settings-switch-grid--values">
                            <!-- 排序方式 -->
                            <div class="switch-card switch-card--wide">
                                <div class="switch-card-head">
                                    <span class="switch-card-title">{{ settingsTxt.sortMethodLabel }}</span>
                                    <el-select v-model="sortMethodModel" class="switch-card-select sort-method-select" popper-class="sort-method-select-popper">
                                        <el-option value="dictionary" :label="settingsTxt.sortMethodDictionary" />
                                        <el-option value="length" :label="settingsTxt.sortMethodLength" />
                                        <el-option value="field" :label="settingsTxt.sortMethodField" />
                                    </el-select>
                                </div>
                                <span class="switch-card-desc">{{ sortMethodDynamicDesc }}</span>
                            </div>

                            <!-- 排序方向 -->
                            <div class="switch-card switch-card--wide">
                                <div class="switch-card-head">
                                    <span class="switch-card-title">{{ settingsTxt.sortOrderLabel }}</span>
                                    <el-radio-group v-model="sortOrderModel" class="switch-card-radio-group">
                                        <el-radio value="asc" border>{{ settingsTxt.sortOrderAsc }}</el-radio>
                                        <el-radio value="desc" border>{{ settingsTxt.sortOrderDesc }}</el-radio>
                                    </el-radio-group>
                                </div>
                                <span class="switch-card-desc">{{ settingsTxt.sortOrderStaticDesc }}</span>
                            </div>
                        </div>
                    </div>
                </el-collapse-item>

                <!-- 存档设置（与通用设置同级，位于去除转义之后） -->
                <el-collapse-item v-if="!isDiffMode" name="archive">
                    <template #title>
                        <div class="settings-collapse-title">
                            <el-icon class="column-title-icon">
                                <Edit />
                            </el-icon>
                            <span>{{ settingsTxt.sectionArchive }}</span>
                        </div>
                    </template>
                    <div class="settings-collapse-content">
                        <div class="settings-switch-grid">
                            <!-- 存档命名方式 -->
                            <div class="switch-card">
                                <div class="switch-card-head">
                                    <span class="switch-card-title">
                                        {{ customArchiveNameModel ? settingsTxt.archiveNameTitleCustom : settingsTxt.archiveNameTitleAuto }}
                                    </span>
                                    <el-switch class="switch-card-toggle" v-model="customArchiveNameModel" size="default" />
                                </div>
                                <span class="switch-card-desc">{{ settingsTxt.archiveNameStaticDesc }}</span>
                            </div>
                        </div>
                    </div>
                </el-collapse-item>
            </el-collapse>
        </div>
        <template #footer>
            <div class="dialog-footer">
                <el-button @click="visibleModel = false">{{ settingsTxt.btnClose }}</el-button>
            </div>
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
import { ElButton, ElCheckbox, ElCollapse, ElCollapseItem, ElDialog, ElIcon, ElOption, ElRadio, ElRadioGroup, ElSelect, ElSwitch } from 'element-plus';
import 'element-plus/es/components/button/style/css';
import 'element-plus/es/components/checkbox/style/css';
import 'element-plus/es/components/collapse/style/css';
import 'element-plus/es/components/collapse-item/style/css';
import 'element-plus/es/components/dialog/style/css';
import 'element-plus/es/components/icon/style/css';
import 'element-plus/es/components/option/style/css';
import 'element-plus/es/components/radio/style/css';
import 'element-plus/es/components/radio-group/style/css';
import 'element-plus/es/components/select/style/css';
import 'element-plus/es/components/switch/style/css';

import { computed } from 'vue';
import { Document, Edit, Refresh, Setting, Sort } from '@element-plus/icons-vue';
import type { SettingsTxt } from './utils/i18n';
import type { ButtonVisibility, SortMethod, SortOrder } from './composables/useToolSettings';

interface Props {
    visible: boolean;
    activeName: string | number;
    settingsTxt: SettingsTxt;
    isDiffMode: boolean;
    wordWrapLocked: boolean;
    buttonVisibility: ButtonVisibility;
    fontSize: number;
    indentSize: number;
    enableDiagnostics: boolean;
    wordWrap: boolean;
    syncScrollEnabled: boolean;
    stickyScroll: boolean;
    showMinimap: boolean;
    encodingMode: boolean;
    arrayNewLine: boolean;
    repairOnFormat: boolean;
    recursiveUnescape: boolean;
    sortMethod: SortMethod;
    sortOrder: SortOrder;
    diffSortArrays: boolean;
    customArchiveName: boolean;
}

type ModelKey = Exclude<keyof Props, 'settingsTxt' | 'isDiffMode' | 'wordWrapLocked'>;

const props = defineProps<Props>();
const emit = defineEmits<{
    'update:visible': [value: boolean];
    'update:activeName': [value: string | number];
    'update:buttonVisibility': [value: ButtonVisibility];
    'update:fontSize': [value: number];
    'update:indentSize': [value: number];
    'update:enableDiagnostics': [value: boolean];
    'update:wordWrap': [value: boolean];
    'update:syncScrollEnabled': [value: boolean];
    'update:stickyScroll': [value: boolean];
    'update:showMinimap': [value: boolean];
    'update:encodingMode': [value: boolean];
    'update:arrayNewLine': [value: boolean];
    'update:repairOnFormat': [value: boolean];
    'update:recursiveUnescape': [value: boolean];
    'update:sortMethod': [value: SortMethod];
    'update:sortOrder': [value: SortOrder];
    'update:diffSortArrays': [value: boolean];
    'update:customArchiveName': [value: boolean];
    updateFontSize: [];
    updateWordWrap: [];
    updateMinimap: [];
    updateStickyScroll: [];
}>();

const createModel = <K extends ModelKey>(key: K) =>
    computed({
        get: () => props[key],
        set: (value) => {
            emit(`update:${key}` as keyof typeof emit, value as never);
        },
    });

const visibleModel = createModel('visible');
const activeNameModel = createModel('activeName');
const buttonVisibilityModel = createModel('buttonVisibility');
const fontSizeModel = createModel('fontSize');
const indentSizeModel = createModel('indentSize');
const enableDiagnosticsModel = createModel('enableDiagnostics');
const wordWrapModel = createModel('wordWrap');
const syncScrollEnabledModel = createModel('syncScrollEnabled');
const stickyScrollModel = createModel('stickyScroll');
const showMinimapModel = createModel('showMinimap');
const encodingModeModel = createModel('encodingMode');
const arrayNewLineModel = createModel('arrayNewLine');
const repairOnFormatModel = createModel('repairOnFormat');
const recursiveUnescapeModel = createModel('recursiveUnescape');
const sortMethodModel = createModel('sortMethod');
const sortOrderModel = createModel('sortOrder');
const diffSortArraysModel = createModel('diffSortArrays');
const customArchiveNameModel = createModel('customArchiveName');

const sortMethodDynamicDesc = computed(() => {
    switch (props.sortMethod) {
        case 'length':
            return props.settingsTxt.sortMethodLengthDesc;
        case 'field':
            return props.settingsTxt.sortMethodFieldDesc;
        case 'dictionary':
        default:
            return props.settingsTxt.sortMethodDictionaryDesc;
    }
});
</script>

<style scoped>
.dialog-header-with-close {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 12px;
}

.dialog-title-with-close {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 18px;
    font-weight: 600;
    color: #303133;
    line-height: 1.5;
}

.dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
}

.dialog-footer .el-button:first-child {
    margin-left: 20px;
}

.demo-close-btn {
    background: none;
    border: none;
    /* 使用固定字号 + line-height:1 消除字符垂直基线偏移；
       字体栈强制走系统无衬线，避免某些中文字体中 '✕' 被渲染得偏大偏斜 */
    font-family:
        system-ui,
        -apple-system,
        'Segoe UI',
        Arial,
        sans-serif;
    font-size: 14px;
    font-weight: 600;
    line-height: 1;
    color: #909399;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
        background-color 0.2s,
        color 0.2s,
        transform 0.15s;
    /* 消除按钮默认可能存在的 text-indent / vertical-align 偏移 */
    text-align: center;
    vertical-align: middle;
}

.demo-close-btn:hover {
    background: #f2f3f5;
    color: #303133;
    transform: scale(1.08);
}

.demo-close-btn:active {
    transform: scale(0.96);
}

.settings-dialog-wrapper :deep(.el-dialog) {
    max-height: calc(100vh - 12vh);
    display: flex;
    flex-direction: column;
    margin-top: 0 !important;
    margin-bottom: 0 !important;
}

/* 确保弹窗内容区域可以滚动 */
.settings-dialog-wrapper :deep(.el-dialog__body) {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    /* 重要：允许 flex 子元素缩小 */
    max-height: 100%;
    /* 确保不超过父容器高度 */
}

.settings-dialog-content {
    padding: 0;
}

/* 手风琴样式 */
.settings-dialog-content :deep(.el-collapse) {
    border: none;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .settings-dialog-content .el-collapse) {
    background: transparent !important;
}

.settings-dialog-content :deep(.el-collapse-item) {
    border-radius: 4px;
    margin-bottom: 8px;
}

.settings-dialog-content :deep(.el-collapse-item:last-child) {
    margin-bottom: 0;
}

.settings-dialog-content :deep(.el-collapse-item__header) {
    box-sizing: border-box;
    /* 避免 padding 改变元素总宽度 */
    display: flex;
    /* 使用 flex 布局，标题在左，箭头在右 */
    align-items: center;
    justify-content: space-between;
    padding: 0;
    /* 内边距交给内部容器 .settings-collapse-title 控制 */

    background-color: #f5f7fa;
    border-radius: 4px;
    font-size: 15px;
    font-weight: 600;
    color: #303133;
    height: auto;
    line-height: 1.4;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .settings-dialog-content .el-collapse-item__header) {
    background-color: #242424 !important;
    color: #cccccc !important;
    border-color: #2b2b2b !important;
}

/* 覆盖 Element Plus 的右侧额外 padding，使左右间距由内部容器控制 */
.settings-dialog-content :deep(.el-collapse-icon-position-right .el-collapse-item__header) {
    padding-right: 24px;
}

.settings-dialog-content :deep(.el-collapse-item__header:hover) {
    background-color: #ecf5ff;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .settings-dialog-content .el-collapse-item__header:hover) {
    background-color: #2a2d35 !important;
}

.settings-dialog-content :deep(.el-collapse-item__header.is-active) {
    background-color: #ecf5ff;
    border-bottom: 1px solid #e4e7ed;
    border-radius: 4px 4px 0 0;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .settings-dialog-content .el-collapse-item__header.is-active) {
    background-color: #2a2d35 !important;
    border-bottom-color: #3a3a3a !important;
}

.settings-dialog-content :deep(.el-collapse-item__wrap) {
    border: none;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .settings-dialog-content .el-collapse-item__wrap) {
    background: #1f1f1f !important;
    border: none !important;
}

.settings-dialog-content :deep(.el-collapse-item__content) {
    padding: 0;
    border-radius: 0 0 4px 4px;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .settings-dialog-content .el-collapse-item__content) {
    background: #1f1f1f !important;
    color: #cccccc !important;
}

.settings-collapse-title {
    display: flex;
    align-items: center;
    gap: 8px;
    width: auto;
    /* 不再占满整行，避免把箭头推远 */
    flex: 0 1 auto;
    /* 保持自适应且允许换行收缩 */
    padding: 12px 24px;
    /* 与折叠项的内部间距一致，保证左右对称视觉 */
}

.settings-collapse-content {
    padding: 16px;
}

.column-title-icon {
    font-size: 18px;
    color: #409eff;
}

.settings-subsection {
    margin-bottom: 16px;
}

.settings-subsection:last-child {
    margin-bottom: 0;
}

.settings-subsection-title {
    font-size: 14px;
    font-weight: 600;
    color: #606266;
    margin-bottom: 12px;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .settings-subsection-title) {
    color: #cccccc !important;
}

/* ===== 通用设置 - 开关网格布局 ===== */
.settings-switch-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
}

.settings-switch-grid--toggles {
    margin-top: 12px;
}

/* 抽屉较窄时回退到单列，避免文字与开关挤在一起 */
@media (max-width: 560px) {
    .settings-switch-grid {
        grid-template-columns: 1fr;
    }
}

.switch-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 12px;
    border: 1px solid #ebeef5;
    border-radius: 8px;
    background: #fafbfc;
    transition:
        border-color 0.2s ease,
        background 0.2s ease,
        box-shadow 0.2s ease;
    min-height: 70px;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .switch-card) {
    background: #242424 !important;
    border-color: #333333 !important;
    color: #cccccc !important;
}

.switch-card:hover {
    border-color: #c6e2ff;
    background: #f5f9ff;
    box-shadow: 0 2px 6px rgba(64, 158, 255, 0.08);
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .switch-card:hover) {
    background: #2a2d35 !important;
    border-color: #3a3a3a !important;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.28) !important;
}

/* 标题 + 开关同行：保证开关与标题垂直居中对齐 */
.switch-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
}

.switch-card-toggle {
    flex-shrink: 0;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .switch-card-toggle.el-switch) {
    --el-switch-on-color: #1d4f73;
    --el-switch-off-color: #30343c;
    --el-switch-border-color: #4a505a;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .switch-card-toggle .el-switch__core) {
    background-color: #30343c !important;
    border-color: #4a505a !important;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .switch-card-toggle:not(.is-disabled):hover .el-switch__core) {
    background-color: #363b45 !important;
    border-color: #5a6370 !important;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .switch-card-toggle.is-checked .el-switch__core) {
    background-color: #1d4f73 !important;
    border-color: #3478a5 !important;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .switch-card-toggle.is-checked:not(.is-disabled):hover .el-switch__core) {
    background-color: #28658e !important;
    border-color: #4091c2 !important;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .switch-card-toggle .el-switch__action) {
    background-color: #d7dce4 !important;
    color: #30343c !important;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.32);
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .switch-card-toggle.is-checked .el-switch__action) {
    background-color: #e8f4ff !important;
    color: #28658e !important;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .switch-card-toggle .el-switch__input:focus-visible ~ .el-switch__core) {
    outline: 2px solid rgba(64, 145, 194, 0.42) !important;
    outline-offset: 2px;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .switch-card-toggle.is-disabled .el-switch__core) {
    background-color: #26282d !important;
    border-color: #363a42 !important;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .switch-card-toggle.is-disabled.is-checked .el-switch__core) {
    background-color: #173c58 !important;
    border-color: #245879 !important;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .switch-card-toggle.is-disabled .el-switch__action) {
    background-color: #8c939d !important;
}

.switch-card-title {
    font-size: 14px;
    font-weight: 600;
    color: #303133;
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .switch-card-title) {
    color: #f0f0f0 !important;
}

.switch-card-desc {
    font-size: 12px;
    color: #909399;
    line-height: 1.55;
    display: block;
    white-space: normal;
    overflow-wrap: anywhere;
    min-height: calc(12px * 1.55 * 2);
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .switch-card-desc) {
    color: #9da0a6 !important;
}

/* 数值类卡片（字体大小 / 缩进）放在 head 右侧的 radio 组 */
.switch-card-radio-group {
    display: flex;
    flex-wrap: nowrap;
    gap: 5px;
    flex-shrink: 0;
}

/* 排序方式下拉框固定宽度，为标题预留空间；选项使用简短文案。 */
.switch-card-select {
    width: 180px;
    flex-shrink: 0;
}

/* 强制下拉面板宽度跟随触发器，避免英文下 popper 自适应撑宽 */
:global(.sort-method-select-popper.el-popper) {
    min-width: 180px !important;
    width: 180px !important;
}

/* 排序卡片的 radio 文案较长（如"按字段值"、"正序（升序）"），
   允许 wrap 防止挤压；该选择器仅作用于带有 .switch-card--wide 的卡片内的 radio 组 */
.switch-card--wide .switch-card-radio-group {
    flex-wrap: wrap;
    justify-content: flex-end;
}

.switch-card-radio-group :deep(.el-radio.is-bordered) {
    padding: 4px 10px;
    height: 28px;
    margin-right: 0;
    border-radius: 6px;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .switch-card-radio-group .el-radio.is-bordered) {
    background: #252525 !important;
    border-color: #3a3a3a !important;
    color: #cccccc !important;
}

/* 隐藏 radio 左侧圆点：选中状态由整颗胶囊的边框/底色高亮表达，避免视觉冗余 */
.switch-card-radio-group :deep(.el-radio__input) {
    display: none;
}

.switch-card-radio-group :deep(.el-radio__label) {
    font-size: 12px;
    padding-left: 0;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .switch-card-radio-group .el-radio__label) {
    color: #cccccc !important;
}

/* 选中态：整颗胶囊高亮，强化"已选中"的视觉权重 */
.switch-card-radio-group :deep(.el-radio.is-bordered.is-checked) {
    background: #ecf5ff;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .switch-card-radio-group .el-radio.is-bordered.is-checked) {
    background: #1d4f73 !important;
    border-color: #3478a5 !important;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .switch-card-radio-group .el-radio.is-bordered.is-checked .el-radio__label) {
    color: #e8f4ff !important;
}

.button-visibility-list {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    grid-auto-rows: min-content;
    gap: 6px 24px;
    align-items: start;
}

@media (max-width: 900px) {
    .button-visibility-list {
        grid-template-columns: repeat(2, 1fr);
    }
}

.button-visibility-item {
    display: flex;
    align-items: center;
}

.button-visibility-item :deep(.el-checkbox) {
    width: 100%;
}

.button-visibility-item :deep(.el-checkbox__label) {
    font-size: 14px;
    color: #606266;
}

:global(body.json-tool-theme-dark .settings-dialog-wrapper .button-visibility-item .el-checkbox__label) {
    color: #cccccc !important;
}

/* 响应式设计 */
@media (max-width: 768px) {
    .settings-dialog-wrapper {
        width: 95vw;
        max-width: none;
    }

    .dialog-header-with-close {
        gap: 8px;
    }

    .button-visibility-list {
        grid-template-columns: 1fr;
    }
}
</style>
