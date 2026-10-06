<template>
    <el-dialog v-model="fieldSortDialogVisibleModel" width="600px" :close-on-click-modal="false" :show-close="false">
        <template #header>
            <div class="dialog-header-with-close">
                <span class="dialog-title-with-close">{{ settingsTxt.fieldSortTitle }}</span>
                <button class="demo-close-btn" @click="fieldSortDialogVisibleModel = false" :aria-label="settingsTxt.fieldSortCloseAria">✕</button>
            </div>
        </template>
        <div class="form-item">
            <div class="form-item-row">
                <div class="form-value-quote--compact" style="width: 100%">
                    <span class="form-compact-line">
                        {{ settingsTxt.demoDirectionLabel }}
                        <span class="form-value-text">{{ sortOrder === 'asc' ? settingsTxt.sortOrderAsc : settingsTxt.sortOrderDesc }}</span>
                    </span>
                </div>
            </div>
        </div>

        <div class="form-item">
            <label class="form-label" @mousedown.prevent @click.prevent>{{ settingsTxt.fieldSortRootPathLabel }}</label>
            <el-autocomplete
                id="sort-root-path-input"
                v-model="sortRootPathModel"
                :fetch-suggestions="queryRootPaths"
                :placeholder="settingsTxt.fieldSortRootPathPlaceholder"
                clearable
                @select="handleRootPathSelect"
                @input="handleRootPathInput"
                @keydown="handleRootPathKeydown">
                <template #default="{ item }">
                    <div class="autocomplete-item">
                        <span class="path-text">{{ item.value }}</span>
                        <span v-if="item.type" class="path-type">{{ getTypeLabel(item.type) }}</span>
                    </div>
                </template>
            </el-autocomplete>
            <div class="form-hint">{{ settingsTxt.fieldSortRootPathHint }}</div>
        </div>

        <div class="form-item">
            <label class="form-label" @mousedown.prevent @click.prevent>{{ settingsTxt.fieldSortFieldLabel }}</label>
            <el-autocomplete
                id="sort-field-name-input"
                v-model="sortFieldNameModel"
                :fetch-suggestions="queryFieldPathsFromScope"
                :trigger-on-focus="true"
                :placeholder="settingsTxt.fieldSortFieldPlaceholder"
                clearable
                @select="handleFieldPathSelect"
                @input="handleFieldPathInput"
                @keydown="handleFieldPathKeydown">
                <template #default="{ item }">
                    <div class="autocomplete-item">
                        <span class="path-text">{{ item.value }}</span>
                        <span v-if="item.type" class="path-type">{{ getTypeLabel(item.type) }}</span>
                    </div>
                </template>
            </el-autocomplete>
            <div class="form-hint">{{ settingsTxt.fieldSortFieldHint }}</div>
        </div>

        <template #footer>
            <el-button @click="fieldSortDialogVisibleModel = false">{{ settingsTxt.btnCancel }}</el-button>
            <el-button type="warning" @click="showFieldSortDemo">{{ settingsTxt.btnDemoExample }}</el-button>
            <el-button type="primary" @click="executeFieldSort">{{ settingsTxt.btnStartSort }}</el-button>
        </template>
    </el-dialog>

    <!-- 演示模式：Popover 贴边引导，不使用遮罩层 -->
    <el-popover
        v-if="isDemoMode && demoGuideVisible && currentDemoStepData"
        :visible="true"
        :virtual-ref="demoPopoverAnchor"
        virtual-triggering
        :width="420"
        :placement="demoPopoverPlacement"
        :show-arrow="true"
        :teleported="true"
        popper-class="demo-guide-popover"
        :offset="12">
        <div class="demo-guide-inner">
            <div class="demo-guide-header">
                <h3>{{ currentDemoStepData.title }}</h3>
                <button class="demo-close-btn" @click="endDemoMode" :aria-label="settingsTxt.demoCloseAria">✕</button>
            </div>
            <div class="demo-guide-content">
                <p>{{ currentDemoStepData.content }}</p>
                <div class="demo-current-settings">
                    <strong>{{ settingsTxt.demoCurrentSettings }}</strong>
                    <ul class="demo-settings-list">
                        <li>
                            <span class="demo-settings-label">{{ settingsTxt.demoDirectionLabel }}</span>
                            <code>{{ sortOrder === 'asc' ? settingsTxt.sortOrderAsc : settingsTxt.sortOrderDesc }}</code>
                        </li>
                        <li>
                            <span class="demo-settings-label">{{ settingsTxt.demoRootPathLabel }}</span>
                            <code>{{ sortRootPath || settingsTxt.demoEmptyValue }}</code>
                        </li>
                        <li>
                            <span class="demo-settings-label">{{ settingsTxt.demoFieldLabel }}</span>
                            <code>{{ sortFieldName || settingsTxt.demoUnsetValue }}</code>
                        </li>
                    </ul>
                </div>
            </div>
            <div class="demo-guide-footer">
                <el-button
                    v-for="(btn, index) in currentDemoStepData.buttons"
                    :key="index"
                    size="small"
                    :type="btn.action === endDemoMode ? 'primary' : 'default'"
                    @click="btn.action()">
                    {{ btn.text }}
                </el-button>
            </div>
            <div class="demo-step-indicator">
                <span v-for="i in demoStepsCount" :key="i" :class="['step-dot', { active: i === currentDemoStep + 1 }]"></span>
            </div>
        </div>
    </el-popover>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SettingsTxt } from './utils/i18n';
import type { SortOrder } from './composables/useToolSettings';

interface PathSuggestion {
    value: string;
    type?: string;
}

interface DemoStepData {
    title: string;
    content: string;
    buttons: Array<{
        text: string;
        action: () => void;
    }>;
}

type SuggestionCallback = (suggestions: PathSuggestion[]) => void;

interface Props {
    fieldSortDialogVisible: boolean;
    sortRootPath: string;
    sortFieldName: string;
    sortOrder: SortOrder;
    settingsTxt: SettingsTxt;
    isDemoMode: boolean;
    demoGuideVisible: boolean;
    currentDemoStepData: DemoStepData | null;
    demoPopoverAnchor: HTMLElement | null;
    demoPopoverPlacement: 'right-start' | 'left-start' | 'bottom-start' | 'top-start';
    demoStepsCount: number;
    currentDemoStep: number;
    queryRootPaths: (queryString: string, cb: SuggestionCallback) => void;
    queryFieldPathsFromScope: (queryString: string, cb: SuggestionCallback) => void;
    handleRootPathSelect: (item: Record<string, any>) => void;
    handleRootPathInput: (value: string | number) => void;
    handleRootPathKeydown: (event: KeyboardEvent) => void;
    handleFieldPathSelect: (item: Record<string, any>) => void;
    handleFieldPathInput: (value: string | number) => void;
    handleFieldPathKeydown: (event: KeyboardEvent) => void;
    getTypeLabel: (type: string) => string;
    showFieldSortDemo: () => void;
    executeFieldSort: () => void;
    endDemoMode: () => void;
}

const props = defineProps<Props>();
const emit = defineEmits<{
    'update:fieldSortDialogVisible': [value: boolean];
    'update:sortRootPath': [value: string];
    'update:sortFieldName': [value: string];
}>();

const fieldSortDialogVisibleModel = computed({
    get: () => props.fieldSortDialogVisible,
    set: (value) => emit('update:fieldSortDialogVisible', value),
});

const sortRootPathModel = computed({
    get: () => props.sortRootPath,
    set: (value) => emit('update:sortRootPath', value),
});

const sortFieldNameModel = computed({
    get: () => props.sortFieldName,
    set: (value) => emit('update:sortFieldName', value),
});
</script>

<style scoped>
.dialog-header-with-close {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 16px;
}

.dialog-title-with-close {
    font-size: 18px;
    font-weight: 600;
    color: #303133;
    line-height: 1.5;
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

.form-item {
    margin-bottom: 16px;
}

.form-item:last-child {
    margin-bottom: 0;
}

.form-label {
    display: block;
    font-weight: 500;
    color: #606266;
    margin-bottom: 6px;
}

.form-item-row {
    display: flex;
    align-items: center;
}

.form-value-quote--compact {
    padding: 12px 16px;
    background: #f6f7f9;
    border: 1px solid rgba(20, 30, 40, 0.04);
    box-sizing: border-box;
}

.form-compact-line {
    font-weight: 600;
    color: #394149;
    font-size: 15px;
    display: inline-block;
    white-space: nowrap;
}

.form-value-text {
    color: #2f3b45;
    font-weight: 600;
    font-size: 15px;
    display: inline-block;
    margin-top: 0;
    line-height: 1;
    letter-spacing: 0.2px;
}

.form-hint {
    margin-top: 6px;
    color: #909399;
    font-size: 12px;
    line-height: 1.5;
}

.autocomplete-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.path-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.path-type {
    flex-shrink: 0;
    color: #909399;
    font-size: 12px;
}

/* 演示模式样式 - Popover 贴边版本 */
/* el-popover 会被 teleport 到 body，使用 popper-class 定位 */
:global(.demo-guide-popover.el-popover) {
    padding: 0 !important;
    border-radius: 6px !important;
    box-shadow: 0 6px 28px rgba(0, 0, 0, 0.18) !important;
    border: 1px solid #dcdfe6 !important;
}

:global(body.json-tool-theme-dark .demo-guide-popover.el-popover) {
    background: #1f1f1f !important;
    border-color: #2b2b2b !important;
    color: #cccccc !important;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5) !important;
}

:global(body.json-tool-theme-dark .demo-guide-popover .el-popper__arrow::before) {
    background: #1f1f1f !important;
    border-color: #2b2b2b !important;
}

.demo-guide-inner {
    animation: demoPopup 0.25s ease-out;
}

@keyframes demoPopup {
    from {
        opacity: 0;
        transform: scale(0.96);
    }

    to {
        opacity: 1;
        transform: scale(1);
    }
}

.demo-guide-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid #f0f0f0;
}

:global(body.json-tool-theme-dark .demo-guide-popover .demo-guide-header) {
    border-bottom-color: #2b2b2b !important;
    background: linear-gradient(to bottom, #232323, #1f1f1f) !important;
}

.demo-guide-header h3 {
    margin: 0;
    color: #303133;
    font-size: 14px;
    font-weight: 600;
}

:global(body.json-tool-theme-dark .demo-guide-popover .demo-guide-header h3) {
    color: #cccccc !important;
}

.demo-guide-content {
    padding: 10px 14px 4px;
}

.demo-guide-content p {
    margin: 0 0 10px 0;
    color: #606266;
    font-size: 13px;
    line-height: 1.6;
}

:global(body.json-tool-theme-dark .demo-guide-popover .demo-guide-content p) {
    color: #9da0a6 !important;
}

.demo-current-settings {
    background: #f5f7fa;
    border: 1px solid #ebeef5;
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 12px;
    color: #606266;
}

:global(body.json-tool-theme-dark .demo-guide-popover .demo-current-settings) {
    background: #242424 !important;
    border-color: #333333 !important;
    color: #cccccc !important;
}

.demo-current-settings strong {
    display: block;
    margin-bottom: 4px;
    color: #303133;
    font-weight: 600;
}

:global(body.json-tool-theme-dark .demo-guide-popover .demo-current-settings strong) {
    color: #f0f0f0 !important;
}

.demo-settings-list {
    list-style: none;
    margin: 0;
    padding: 0;
}

.demo-settings-list li {
    display: flex;
    align-items: center;
    padding: 2px 0;
    line-height: 1.7;
}

.demo-settings-label {
    flex-shrink: 0;
    color: #909399;
    min-width: 68px;
}

:global(body.json-tool-theme-dark .demo-guide-popover .demo-settings-label) {
    color: #9da0a6 !important;
}

.demo-current-settings code {
    padding: 1px 5px;
    border-radius: 3px;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 12px;
    color: #d73a49;
}

:global(body.json-tool-theme-dark .demo-guide-popover .demo-current-settings code) {
    background: #303030 !important;
    color: #d4d4d4 !important;
}

.demo-guide-footer {
    padding: 8px 14px;
    text-align: right;
    border-top: 1px solid #f5f7fa;
}

:global(body.json-tool-theme-dark .demo-guide-popover .demo-guide-footer) {
    border-top-color: #2b2b2b !important;
    background: #1f1f1f !important;
}

.demo-guide-footer .el-button + .el-button {
    margin-left: 6px;
}

.demo-step-indicator {
    display: flex;
    justify-content: center;
    padding: 0 14px 10px;
    gap: 6px;
}

.step-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #e4e7ed;
    transition: background-color 0.3s;
}

:global(body.json-tool-theme-dark .demo-guide-popover .step-dot) {
    background: #4a4a4a !important;
}

.step-dot.active {
    background: #409eff;
}

/* 演示模式下当前引导元素的脉冲高亮描边 */
/* 通过 transform: scale 让元素主动从贴边位置微微缩进，留出 box-shadow 绘制空间，
   避免在浏览器窗口边缘（编辑区左侧、预览区右侧）被视口裁切看不到 */
:global(.demo-highlight-target) {
    position: relative;
    z-index: 2000;
    border-radius: 4px;
    transform: scale(0.994);
    transform-origin: center center;
    animation: demoPulse 1.8s ease-in-out infinite;
    transition:
        box-shadow 0.2s,
        transform 0.2s;
}

@keyframes demoPulse {
    0%,
    100% {
        box-shadow:
            0 0 0 2px #409eff,
            0 0 0 5px rgba(64, 158, 255, 0.3);
    }
    50% {
        box-shadow:
            0 0 0 2px #409eff,
            0 0 0 8px rgba(64, 158, 255, 0.12);
    }
}

/* 当前设置区域样式，增加与按钮的间距 */
.demo-current-settings {
    margin-top: 12px;
    margin-bottom: 18px;
    color: #606266;
    font-size: 14px;
    line-height: 1.6;
    word-break: break-word;
}
</style>
