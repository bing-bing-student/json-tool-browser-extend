<template>
        <el-dialog v-model="affixDialogVisible" width="460px" :close-on-click-modal="false" :show-close="false" custom-class="affix-dialog">
            <template #header>
                <div class="dialog-header-with-close">
                    <span class="dialog-title-with-close">{{ settingsTxt.affixDialogTitle }}</span>
                    <button class="demo-close-btn" @click="affixDialogVisible = false" :aria-label="settingsTxt.affixCloseAria">✕</button>
                </div>
            </template>

            <div class="affix-panel">
                <div class="affix-section">
                    <div class="affix-row-head">
                        <label class="affix-row-label">{{ settingsTxt.affixPrefixSection }}</label>
                        <el-button-group class="affix-mode-group">
                            <el-button
                                size="small"
                                :type="affixPrefixMode === 'add' ? 'primary' : 'default'"
                                @click="affixPrefixMode = affixPrefixMode === 'add' ? 'none' : 'add'">
                                {{ settingsTxt.affixModeAdd }}
                            </el-button>
                            <el-button
                                size="small"
                                :type="affixPrefixMode === 'remove' ? 'primary' : 'default'"
                                @click="affixPrefixMode = affixPrefixMode === 'remove' ? 'none' : 'remove'">
                                {{ settingsTxt.affixModeRemove }}
                            </el-button>
                        </el-button-group>
                    </div>
                    <el-input
                        v-model="affixPrefixValue"
                        class="affix-row-input"
                        size="default"
                        :disabled="affixPrefixMode === 'none'"
                        :placeholder="affixPrefixMode === 'remove' ? settingsTxt.affixPrefixRemovePlaceholder : settingsTxt.affixPrefixAddPlaceholder"
                        clearable />
                </div>

                <div class="affix-section">
                    <div class="affix-row-head">
                        <label class="affix-row-label">{{ settingsTxt.affixSuffixSection }}</label>
                        <el-button-group class="affix-mode-group">
                            <el-button
                                size="small"
                                :type="affixSuffixMode === 'add' ? 'primary' : 'default'"
                                @click="affixSuffixMode = affixSuffixMode === 'add' ? 'none' : 'add'">
                                {{ settingsTxt.affixModeAdd }}
                            </el-button>
                            <el-button
                                size="small"
                                :type="affixSuffixMode === 'remove' ? 'primary' : 'default'"
                                @click="affixSuffixMode = affixSuffixMode === 'remove' ? 'none' : 'remove'">
                                {{ settingsTxt.affixModeRemove }}
                            </el-button>
                        </el-button-group>
                    </div>
                    <el-input
                        v-model="affixSuffixValue"
                        class="affix-row-input"
                        size="default"
                        :disabled="affixSuffixMode === 'none'"
                        :placeholder="affixSuffixMode === 'remove' ? settingsTxt.affixSuffixRemovePlaceholder : settingsTxt.affixSuffixAddPlaceholder"
                        clearable />
                </div>
            </div>

            <template #footer>
                <el-button @click="affixDialogVisible = false">{{ settingsTxt.btnCancel }}</el-button>
                <el-button type="primary" @click="$emit('apply')">{{ settingsTxt.affixApply }}</el-button>
            </template>
        </el-dialog>
</template>

<script setup lang="ts">
import { ElButton, ElButtonGroup, ElDialog, ElInput } from 'element-plus';
import 'element-plus/es/components/button/style/css';
import 'element-plus/es/components/button-group/style/css';
import 'element-plus/es/components/dialog/style/css';
import 'element-plus/es/components/input/style/css';

import type { SettingsTxt } from './utils/i18n';
defineProps<{ settingsTxt: SettingsTxt }>();
defineEmits<{ apply: [] }>();
type AffixMode = 'none' | 'add' | 'remove';
const affixDialogVisible = defineModel<boolean>('visible', { required: true });
const affixPrefixMode = defineModel<AffixMode>('prefixMode', { required: true });
const affixSuffixMode = defineModel<AffixMode>('suffixMode', { required: true });
const affixPrefixValue = defineModel<string>('prefixValue', { required: true });
const affixSuffixValue = defineModel<string>('suffixValue', { required: true });
</script>

<style scoped>
.affix-panel {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 4px 0 2px;
}

.affix-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.affix-row-head {
    display: flex;
    align-items: center;
    gap: 12px;
}

.affix-row-label {
    font-size: 14px;
    font-weight: 500;
    color: #1f2329;
    line-height: 1;
    flex-shrink: 0;
    min-width: 32px;
}

.affix-mode-group :deep(.el-button + .el-button) {
    margin-left: 0;
}

.affix-mode-group :deep(.el-button) {
    min-width: 56px;
}

.affix-row-input.is-disabled :deep(.el-input__wrapper) {
    background-color: #f7f8fa;
}

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
</style>
