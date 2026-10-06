<template>
    <div class="json-tool-root" :class="themeRootClass">
        <!-- 添加小屏幕提示组件 -->
        <div class="screen-size-warning">
            <el-icon class="warning-icon">
                <WarningFilled />
            </el-icon>
            <div class="warning-text">
                <p>{{ settingsTxt.screenWarn1 }}</p>
                <p>{{ settingsTxt.screenWarn2 }}</p>
            </div>
        </div>

        <!-- 原有的 JSON 工具容器 -->
        <div class="json-tool-container">
            <!-- 工具栏 -->
            <div class="tool-bar-wrapper">
                <!-- 左侧渐变遮罩和滚动按钮 -->
                <div v-if="canScrollLeft" class="scroll-indicator scroll-indicator-left">
                    <el-button type="primary" circle size="small" class="scroll-btn scroll-btn-left" @click="scrollToolBar('left')" :icon="ArrowLeft" />
                    <div class="gradient-mask gradient-mask-left"></div>
                </div>

                <!-- Diff 模式工具栏 -->
                <div v-if="diffMode.isDiffMode.value" class="tool-bar diff-tool-bar">
                    <el-button type="info" class="settings-tool-button" @click="openSettingsDialog">
                        <el-icon><Setting /></el-icon>
                    </el-button>
                    <div class="diff-nav-group">
                        <div class="diff-nav-cluster">
                            <button
                                type="button"
                                class="diff-nav-action diff-nav-action-prev"
                                :disabled="diffMode.diffCount.value === 0"
                                @click="diffMode.goToPrevDiff">
                                <el-icon><ArrowLeft /></el-icon>
                                <span>{{ settingsTxt.diffPrev }}</span>
                            </button>
                            <span class="diff-nav-status">
                                {{ settingsTxt.diffCountSummary(diffMode.activeDiffIndex.value, diffMode.diffCount.value) }}
                            </span>
                            <button
                                type="button"
                                class="diff-nav-action diff-nav-action-next"
                                :disabled="diffMode.diffCount.value === 0"
                                @click="diffMode.goToNextDiff">
                                <span>{{ settingsTxt.diffNext }}</span>
                                <el-icon><ArrowRight /></el-icon>
                            </button>
                        </div>
                    </div>
                    <el-button type="info" @click="diffMode.exitDiffMode">{{ settingsTxt.diffExit }}</el-button>
                </div>

                <!-- 普通模式工具栏 -->
                <div v-else class="tool-bar" ref="toolBarRef" @scroll="handleToolBarScroll">
                    <el-button type="info" class="settings-tool-button" @click="openSettingsDialog">
                        <el-icon>
                            <Setting />
                        </el-icon>
                    </el-button>

                    <!-- 演示模式下，除"设置"按钮外的所有功能暂时禁用，避免用户误操作打断引导流程 -->
                    <div class="toolbar-actions" :class="{ 'demo-locked-area': isDemoMode }">
                        <el-button-group class="main-action-group">
                            <el-button v-if="buttonVisibility.format" type="primary" @click="formatJSON">
                                {{ settingsTxt.toolFormat }}
                            </el-button>
                            <el-button v-if="buttonVisibility.compress" type="primary" @click="compressJSON">
                                {{ settingsTxt.toolCompress }}
                            </el-button>
                            <el-button v-if="buttonVisibility.escape" type="primary" @click="compressAndEscapeJSON">
                                {{ settingsTxt.toolEscape }}
                            </el-button>
                            <el-button v-if="buttonVisibility.unescape" type="primary" @click="handleEscapeCommand('unescape')">
                                {{ settingsTxt.toolUnescape }}
                            </el-button>
                            <el-button v-if="buttonVisibility.masking" type="primary" @click="openDataMaskingDialog">
                                {{ settingsTxt.toolMasking }}
                            </el-button>
                            <el-button v-if="buttonVisibility.sort" type="primary" @click="handleAdvancedCommand('sort')">
                                {{ settingsTxt.toolSort }}
                            </el-button>
                            <el-button v-if="buttonVisibility.archive" type="primary" @click="handleSaveArchive">
                                {{ settingsTxt.toolArchive }}
                            </el-button>
                            <el-button v-if="buttonVisibility.diff" type="primary" @click="diffMode.enterDiffMode">{{ settingsTxt.toolDiff }}</el-button>

                            <el-dropdown v-if="buttonVisibility.dataConvert" class="data-convert-dropdown" trigger="click" @command="handleConvert">
                                <el-button type="primary">
                                    {{ settingsTxt.toolDataConvert }}
                                    <el-icon class="el-icon--right">
                                        <ArrowDown />
                                    </el-icon>
                                </el-button>
                                <template #dropdown>
                                    <el-dropdown-menu>
                                        <el-dropdown-item command="yaml">{{ settingsTxt.convertYaml }}</el-dropdown-item>
                                        <el-dropdown-item command="toml">{{ settingsTxt.convertToml }}</el-dropdown-item>
                                        <el-dropdown-item command="xml">{{ settingsTxt.convertXml }}</el-dropdown-item>
                                        <el-dropdown-item command="go">{{ settingsTxt.convertGo }}</el-dropdown-item>
                                        <el-dropdown-item command="typescript">{{ settingsTxt.convertTypeScript }}</el-dropdown-item>
                                        <el-dropdown-item command="cookie">{{ settingsTxt.convertCookie }}</el-dropdown-item>
                                    </el-dropdown-menu>
                                </template>
                            </el-dropdown>
                        </el-button-group>

                        <div v-if="buttonVisibility.collapse" class="collapse-control">
                            <el-select
                                v-model="selectedLevel"
                                fit-input-width
                                :placeholder="settingsTxt.levelPlaceholder"
                                :class="['level-select', { 'level-select-en': props.locale === 'en' }]"
                                :popper-class="props.locale === 'en' ? 'level-select-dropdown level-select-dropdown-en' : 'level-select-dropdown'"
                                :disabled="maxLevel === 0">
                                <el-option v-if="maxLevel === 0" :label="settingsTxt.levelLabel(0)" :value="0" :disabled="true" />
                                <el-option v-for="n in maxLevel" :key="n" :label="getFoldLevelOptionLabel(n)" :value="n" :disabled="isFoldLevelDisabled(n)" />
                            </el-select>
                            <el-button
                                type="success"
                                class="level-action-button"
                                :class="{ 'level-action-button-disabled-by-level': isSelectedFoldLevelDisabled }"
                                @click="handleLevelAction"
                                :disabled="maxLevel === 0 || isSelectedFoldLevelDisabled">
                                {{ settingsTxt.collapse }}
                            </el-button>
                        </div>

                    </div>
                </div>

                <!-- 右侧渐变遮罩和滚动按钮 -->
                <div v-if="canScrollRight" class="scroll-indicator scroll-indicator-right">
                    <div class="gradient-mask gradient-mask-right"></div>
                    <el-button type="primary" circle size="small" class="scroll-btn scroll-btn-right" @click="scrollToolBar('right')" :icon="ArrowRight" />
                </div>
            </div>

            <!-- Diff 模式编辑区域：拆分到 JsonToolDiffPane 子组件 -->
            <JsonToolDiffPane v-if="diffMode.isDiffMode.value" :settings-txt="settingsTxt" />

            <!-- 普通编辑区域 -->
            <div v-else ref="mainEditorContainer" class="editor-container">
                <template v-if="archives.length">
                    <div
                        class="archive-sidebar"
                        :class="{
                            collapsed: archiveSidebarWidth <= calculateArchiveMinWidth(),
                            'archive-dragging': !!draggingArchiveId,
                        }"
                        :style="{ width: archiveSidebarWidth + 'px' }">
                        <div class="archive-sidebar-header" :style="{ '--archive-header-gap': `${getArchiveHeaderGap()}px` }">
                            <span class="archive-header-action-wrap" :title="settingsTxt.dialogRenameArchive">
                                <button
                                    class="archive-header-action"
                                    type="button"
                                    :disabled="!activeArchiveId"
                                    @click.stop="handleRenameActiveArchive"
                                    @dblclick.stop>
                                    <el-icon>
                                        <Edit />
                                    </el-icon>
                                </button>
                            </span>
                            <span class="archive-header-action-wrap" :title="settingsTxt.archiveRefreshTip">
                                <button
                                    class="archive-header-action"
                                    type="button"
                                    :disabled="!activeArchiveId"
                                    @click.stop="handleRefreshActiveArchive"
                                    @dblclick.stop>
                                    <el-icon>
                                        <Refresh />
                                    </el-icon>
                                </button>
                            </span>
                            <span class="archive-header-action-wrap" :title="settingsTxt.confirmDeleteArchiveTitle">
                                <button
                                    class="archive-header-action danger"
                                    type="button"
                                    :disabled="!activeArchiveId"
                                    @click.stop="handleDeleteActiveArchive"
                                    @dblclick.stop>
                                    <el-icon>
                                        <Delete />
                                    </el-icon>
                                </button>
                            </span>
                        </div>
                        <div class="archive-list" v-if="archives.length" ref="archiveListRef" @dragover="onArchiveListDragOver" @drop="onArchiveListDrop">
                            <template v-for="(item, idx) in archives" :key="item.id">
                                <div v-if="dropIndicatorIndex === idx" class="archive-drop-indicator"></div>
                                <div
                                    class="archive-item"
                                    :draggable="dragEnabledArchiveId === item.id"
                                    @click="handleArchiveCommand(item.id)"
                                    @mousedown="onArchivePressStart(item.id, $event)"
                                    @touchstart.passive="onArchivePressStart(item.id, $event)"
                                    @dragstart="onArchiveDragStart(item, $event)"
                                    @dragenter="onArchiveDragEnter(item.id)"
                                    @dragover="onArchiveDragOver($event, item.id, idx)"
                                    @drop="onArchiveDrop(item.id)"
                                    @dragend="onArchiveDragEnd"
                                    :class="{
                                        dragging: draggingArchiveId === item.id,
                                        'drag-over': dragOverArchiveId === item.id,
                                        'drag-ready': dragEnabledArchiveId === item.id,
                                        'is-active': activeArchiveId === item.id,
                                    }">
                                    <span class="archive-name" :title="item.name">
                                        {{ archiveSidebarWidth <= calculateArchiveMinWidth() ? getCollapsedArchiveName(item.name) : item.name }}
                                    </span>
                                </div>
                            </template>
                            <div v-if="dropIndicatorIndex === archives.length" class="archive-drop-indicator"></div>
                        </div>
                    </div>
                    <!-- 分割线 -->
                    <div class="archive-resizer" @mousedown="startArchiveResize" @touchstart.passive="startArchiveResize"></div>
                </template>

                <div class="editor-panel editor-panel-input" :style="{ width: `${leftPanelWidth}%` }">
                    <div class="panel-header" @dblclick="toggleInputMaximize">
                        <div class="panel-title">
                            <span>{{ settingsTxt.panelEditor }}</span>
                        </div>
                        <div
                            class="panel-actions"
                            @dblclick.stop
                            :style="{
                                '--panel-actions-opacity': showInputActions ? 1 : 0,
                                '--panel-actions-pointer-events': showInputActions ? 'auto' : 'none',
                            }">
                            <el-button @click="clearInput(true)" size="small" type="danger" plain>
                                <el-icon>
                                    <Delete />
                                </el-icon>
                                <span>{{ settingsTxt.panelClear }}</span>
                            </el-button>
                            <el-upload class="upload-json" accept=".json" :auto-upload="false" :show-file-list="false" :on-change="handleFileUpload">
                                <el-button size="small" type="primary" plain>
                                    <el-icon>
                                        <Upload />
                                    </el-icon>
                                    <span>{{ settingsTxt.panelUpload }}</span>
                                </el-button>
                            </el-upload>
                        </div>
                    </div>
                    <div
                        class="editor-wrapper"
                        :class="{ 'editor-wrapper--drag-active': isInputDragActive }"
                        @dragenter.prevent="handleInputDragEnter"
                        @dragover.prevent="handleInputDragOver"
                        @dragleave.prevent="handleInputDragLeave"
                        @drop.prevent="handleInputFileDrop">
                        <div class="monaco-editor-container" @mousedown.capture="handleUnsafeLongLineMouseDown($event, 'input')">
                            <div v-if="isInputDragActive" class="editor-drag-upload-overlay" aria-hidden="true">
                                <div class="editor-drag-upload-card">
                                    <el-icon class="editor-drag-upload-icon">
                                        <Upload />
                                    </el-icon>
                                    <span>{{ settingsTxt.panelDragUpload }}</span>
                                </div>
                            </div>
                            <div v-if="!editorsInitialized" class="editor-loading">
                                <el-icon class="loading-icon">
                                    <Loading />
                                </el-icon>
                                <span>{{ settingsTxt.editorLoading }}</span>
                            </div>
                            <div ref="inputEditorContainer" class="monaco-editor-instance"></div>
                        </div>
                        <!-- 编辑区域状态栏 -->
                        <div class="editor-status-bar" v-if="inputEditorStatus || inputEditorErrors.length > 0">
                            <span v-if="inputEditorStatus" class="status-text">{{ inputEditorStatus }}</span>
                            <div v-if="inputEditorErrors.length > 0" class="error-nav-inline" role="group" :aria-label="settingsTxt.errorNavGroup">
                                <el-icon class="error-nav-icon error-warning-icon"><WarningFilled /></el-icon>
                                <span class="error-nav-count">{{ inputEditorErrors.length }}</span>
                                <button
                                    type="button"
                                    class="error-nav-btn"
                                    @click="goToPrevError"
                                    :aria-label="settingsTxt.errorNavPrev"
                                    :title="settingsTxt.errorNavPrev">
                                    <el-icon class="error-nav-icon error-nav-arrow"><ArrowUp /></el-icon>
                                </button>
                                <button
                                    type="button"
                                    class="error-nav-btn"
                                    @click="goToNextError"
                                    :aria-label="settingsTxt.errorNavNext"
                                    :title="settingsTxt.errorNavNext">
                                    <el-icon class="error-nav-icon error-nav-arrow"><ArrowDown /></el-icon>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 添加可拖动分隔线 -->
                <div class="resizer" :class="{ 'resizer-locked-during-demo': isDemoMode }" @pointerdown.self="startResize">
                    <el-button
                        class="transfer-button"
                        type="primary"
                        :disabled="isDemoMode"
                        @pointerdown.stop
                        @click.stop="transferToInput"
                        :aria-label="settingsTxt.transferToInput">
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            role="img"
                            aria-hidden="true"
                            focusable="false">
                            <path d="M10 18L4 12L10 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                            <path d="M4 12H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                        </svg>
                    </el-button>
                </div>

                <div class="editor-panel editor-panel-output" :style="{ width: `${100 - leftPanelWidth}%` }">
                    <div class="panel-header" @dblclick="toggleOutputMaximize">
                        <div class="panel-title">
                            <span>{{ settingsTxt.panelPreview }}</span>
                        </div>
                        <div
                            class="panel-actions"
                            @dblclick.stop
                            :style="{
                                '--panel-actions-opacity': showOutputActions ? 1 : 0,
                                '--panel-actions-pointer-events': showOutputActions ? 'auto' : 'none',
                            }">
                            <el-button @click="copyOutput" size="small" type="success" plain>
                                <el-icon>
                                    <CopyDocument />
                                </el-icon>
                                <span>{{ settingsTxt.panelCopy }}</span>
                            </el-button>
                            <el-button
                                class="preview-download-button"
                                @click="downloadOutput"
                                size="small"
                                type="info"
                                plain>
                                <el-icon>
                                    <Download />
                                </el-icon>
                                <span>{{ settingsTxt.panelDownload }}</span>
                            </el-button>
                        </div>
                    </div>
                    <div class="editor-wrapper">
                        <div class="monaco-editor-container" @mousedown.capture="handleUnsafeLongLineMouseDown($event, 'output')">
                            <div v-if="!editorsInitialized" class="editor-loading">
                                <el-icon class="loading-icon">
                                    <Loading />
                                </el-icon>
                                <span>{{ settingsTxt.editorLoading }}</span>
                            </div>
                            <div ref="outputEditorContainer" class="monaco-editor-instance"></div>
                        </div>
                        <!-- 预览区域状态栏 -->
                        <div class="editor-status-bar editor-status-bar--output">
                            <span v-if="outputEditorStatus" class="status-text">{{ outputEditorStatus }}</span>
                            <div class="status-action-menu" :aria-label="settingsTxt.statusMenuAria">
                                <button
                                    type="button"
                                    class="status-action-button status-action-button--theme"
                                    :title="settingsTxt.statusThemeSwitchTitle"
                                    :aria-label="settingsTxt.statusThemeSwitchTitle"
                                    @click="toggleThemeMode">
                                    <svg v-if="themeMode === 'dark'" class="status-theme-icon status-theme-icon--sun" viewBox="0 0 24 24" aria-hidden="true">
                                        <circle cx="12" cy="12" r="4.25" />
                                        <path d="M12 2.5v2.25M12 19.25v2.25M4.75 4.75l1.6 1.6M17.65 17.65l1.6 1.6M2.5 12h2.25M19.25 12h2.25M4.75 19.25l1.6-1.6M17.65 6.35l1.6-1.6" />
                                    </svg>
                                    <svg v-else class="status-theme-icon status-theme-icon--moon" viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M20.2 14.45A7.65 7.65 0 0 1 9.55 3.8 8.2 8.2 0 1 0 20.2 14.45Z" />
                                    </svg>
                                </button>
                                <button type="button" class="status-action-button" :title="settingsTxt.statusLanguageSwitchTitle" @click="switchJsonToolLocale">
                                    {{ settingsTxt.statusLanguageSwitch }}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div
                    v-if="shouldShowFirstUseGuide"
                    class="first-use-guide"
                    role="region"
                    :aria-label="settingsTxt.firstUseGuideTitle"
                    :style="{ '--first-use-guide-left': archives.length ? `${archiveSidebarWidth + 3}px` : '0px' }">
                    <div class="first-use-guide-card">
                        <h3 class="first-use-guide-title">{{ settingsTxt.firstUseGuideTitle }}</h3>
                        <p class="first-use-guide-desc">{{ settingsTxt.firstUseGuideDesc }}</p>
                        <div class="first-use-guide-actions">
                            <el-button type="primary" size="small" @click="loadFirstUseSample">
                                {{ settingsTxt.firstUseGuideLoad }}
                            </el-button>
                            <button type="button" class="first-use-guide-skip" @click="dismissFirstUseGuide">
                                {{ settingsTxt.firstUseGuideSkip }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>


        <!-- 数据脱敏对话框 -->
        <DataMaskingDialog v-if="dataMaskingDialogVisible" v-model="dataMaskingDialogVisible" :json-data="getInputEditorValue()" :locale="props.locale" @apply="handleDataMaskingApply" />

        <!-- 存档名称输入对话框 -->
        <ArchiveNameDialog
            v-if="archiveNameDialogVisible"
            v-model="archiveNameDialogVisible"
            :title="archiveNameDialogTitle"
            :input-value="archiveNameDialogInputValue"
            :placeholder="archiveNameDialogPlaceholder"
            :existing-archives="archives"
            :exclude-archive-id="archiveNameDialogExcludeId"
            :locale="props.locale"
            @confirm="handleArchiveNameConfirm"
            @cancel="handleArchiveNameCancel" />

        <SettingsDialog
            v-if="settingsDialogVisible"
            v-model:visible="settingsDialogVisible"
            v-model:active-name="settingsCollapseActiveNames"
            v-model:button-visibility="buttonVisibility"
            v-model:font-size="fontSize"
            v-model:indent-size="indentSize"
            v-model:enable-diagnostics="enableDiagnostics"
            v-model:word-wrap="effectiveWordWrap"
            v-model:sync-scroll-enabled="syncScrollEnabled"
            v-model:sticky-scroll="stickyScroll"
            v-model:show-minimap="showMinimap"
            v-model:encoding-mode="encodingMode"
            v-model:array-new-line="arrayNewLine"
            v-model:recursive-unescape="recursiveUnescape"
            v-model:sort-method="sortMethod"
            v-model:sort-order="sortOrder"
            v-model:diff-sort-arrays="diffSortArrays"
            v-model:custom-archive-name="customArchiveName"
            :settings-txt="settingsTxt"
            :is-diff-mode="diffMode.isDiffMode.value"
            :word-wrap-locked="isLongLineWrapLocked"
            @update-font-size="updateFontSize"
            @update-word-wrap="updateWordWrap"
            @update-minimap="updateMinimap"
            @update-sticky-scroll="updateStickyScroll" />

        <JsonSortFeature
            v-if="fieldSortDialogVisible || demoGuideVisible"
            v-model:field-sort-dialog-visible="fieldSortDialogVisible"
            v-model:sort-root-path="sortRootPath"
            v-model:sort-field-name="sortFieldName"
            :settings-txt="settingsTxt"
            :sort-order="sortOrder"
            :is-demo-mode="isDemoMode"
            :demo-guide-visible="demoGuideVisible"
            :current-demo-step-data="currentDemoStepData"
            :demo-popover-anchor="demoPopoverAnchor"
            :demo-popover-placement="demoPopoverPlacement"
            :demo-steps-count="demoStepsCount"
            :current-demo-step="currentDemoStep"
            :query-root-paths="queryRootPaths"
            :query-field-paths-from-scope="queryFieldPathsFromScope"
            :handle-root-path-select="handleRootPathSelect"
            :handle-root-path-input="handleRootPathInput"
            :handle-root-path-keydown="handleRootPathKeydown"
            :handle-field-path-select="handleFieldPathSelect"
            :handle-field-path-input="handleFieldPathInput"
            :handle-field-path-keydown="handleFieldPathKeydown"
            :get-type-label="getTypeLabel"
            :show-field-sort-demo="showFieldSortDemo"
            :execute-field-sort="executeFieldSort"
            :end-demo-mode="endDemoMode" />

        <!-- 批量加 / 去前后缀对话框：前缀与后缀两组完全独立，同组 add/remove 通过单选互斥 -->
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
                <el-button type="primary" @click="applyBatchAffix">{{ settingsTxt.affixApply }}</el-button>
            </template>
        </el-dialog>
    </div>
</template>

<script setup lang="ts">
// Vue
import { ref, computed, watch, onMounted, onBeforeUnmount, onUnmounted, nextTick, provide, getCurrentInstance, defineAsyncComponent } from 'vue';

// 第三方库
import { parseTree, findNodeAtOffset, getNodePath, getLocation, type Node as JsonAstNode } from 'jsonc-parser';

// Element Plus
import {
    ElAlert,
    ElAutocomplete,
    ElButton,
    ElButtonGroup,
    ElCheckbox,
    ElCollapse,
    ElCollapseItem,
    ElCollapseTransition,
    ElDialog,
    ElDropdown,
    ElDropdownItem,
    ElDropdownMenu,
    ElEmpty,
    ElIcon,
    ElInput,
    ElInputNumber,
    ElMessage,
    ElMessageBox,
    ElOption,
    ElPopover,
    ElRadio,
    ElRadioButton,
    ElRadioGroup,
    ElSelect,
    ElSwitch,
    ElTable,
    ElTableColumn,
    ElTag,
    ElUpload,
} from 'element-plus';
import type { UploadFile } from 'element-plus';
import { Loading, ArrowLeft, ArrowRight, ArrowDown, ArrowUp, CopyDocument, Download, Upload, Delete, Setting, WarningFilled, Edit, Refresh } from '@element-plus/icons-vue';
import 'element-plus/theme-chalk/base.css';
import 'element-plus/theme-chalk/el-alert.css';
import 'element-plus/theme-chalk/el-autocomplete.css';
import 'element-plus/theme-chalk/el-button.css';
import 'element-plus/theme-chalk/el-button-group.css';
import 'element-plus/theme-chalk/el-checkbox.css';
import 'element-plus/theme-chalk/el-collapse.css';
import 'element-plus/theme-chalk/el-collapse-transition.css';
import 'element-plus/theme-chalk/el-dialog.css';
import 'element-plus/theme-chalk/el-dropdown.css';
import 'element-plus/theme-chalk/el-dropdown-item.css';
import 'element-plus/theme-chalk/el-dropdown-menu.css';
import 'element-plus/theme-chalk/el-empty.css';
import 'element-plus/theme-chalk/el-icon.css';
import 'element-plus/theme-chalk/el-input.css';
import 'element-plus/theme-chalk/el-input-number.css';
import 'element-plus/theme-chalk/el-loading.css';
import 'element-plus/theme-chalk/el-message.css';
import 'element-plus/theme-chalk/el-message-box.css';
import 'element-plus/theme-chalk/el-option.css';
import 'element-plus/theme-chalk/el-overlay.css';
import 'element-plus/theme-chalk/el-popover.css';
import 'element-plus/theme-chalk/el-popper.css';
import 'element-plus/theme-chalk/el-radio.css';
import 'element-plus/theme-chalk/el-radio-button.css';
import 'element-plus/theme-chalk/el-radio-group.css';
import 'element-plus/theme-chalk/el-scrollbar.css';
import 'element-plus/theme-chalk/el-select.css';
import 'element-plus/theme-chalk/el-switch.css';
import 'element-plus/theme-chalk/el-table.css';
import 'element-plus/theme-chalk/el-tag.css';
import 'element-plus/theme-chalk/el-tooltip.css';
import 'element-plus/theme-chalk/el-upload.css';
import { showMessageError, showMessageSuccess, showMessageWarning } from '@/utils/jsonToolMessage';

// Monaco Editor
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching';
import 'monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard';
import 'monaco-editor/esm/vs/editor/contrib/comment/browser/comment';
import 'monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu';
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController';
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding';
import 'monaco-editor/esm/vs/editor/contrib/longLinesHelper/browser/longLinesHelper';
import 'monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor';
import 'monaco-editor/esm/vs/editor/contrib/smartSelect/browser/smartSelect';
import 'monaco-editor/esm/vs/editor/contrib/stickyScroll/browser/stickyScrollContribution';
import 'monaco-editor/esm/vs/editor/contrib/stickyScroll/browser/stickyScroll.css';
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css';
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding.css';
import 'monaco-editor/esm/vs/editor/standalone/browser/quickAccess/standaloneGotoLineQuickAccess';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';

const ArchiveNameDialog = defineAsyncComponent(() => import('./ArchiveNameDialog.vue'));
const DataMaskingDialog = defineAsyncComponent(() => import('./DataMaskingDialog.vue'));
const JsonToolDiffPane = defineAsyncComponent(() => import('./JsonToolDiffPane.vue'));
const JsonSortFeature = defineAsyncComponent(() => import('./JsonSortFeature.vue'));
const SettingsDialog = defineAsyncComponent(() => import('./SettingsDialog.vue'));

// 组合式函数
import { useEditorContextMenu } from './composables/useEditorContextMenu';
import { DIFF_MODE_INJECTION_KEY, useDiffMode } from './composables/useDiffMode';
import { MAX_ARCHIVE_COUNT, useJsonArchives, type JsonArchive } from './composables/useJsonArchives';
import { useJsonEngine } from './composables/useJsonEngine';
import { useJsonLevelAnalysis } from './composables/useJsonLevelAnalysis';
import { setupJsonFoldingInfoDisplay } from './composables/useJsonFoldingInfoDisplay';
import { getDefaultFoldLevel, useJsonFoldingLevels } from './composables/useJsonFoldingLevels';
import { useJsonFoldingSummaryPrecompute } from './composables/useJsonFoldingSummaryPrecompute';
import type { DemoPopoverPlacement, PathSuggestion, UseJsonSortReturn } from './composables/useJsonSort';
import { useJsonToolFirstUseGuide } from './composables/useJsonToolFirstUseGuide';
import { useJsonToolSettingsDialog } from './composables/useJsonToolSettingsDialog';
import { useMonacoLanguageRegistry } from './composables/useMonacoLanguageRegistry';
import { useTabId } from './composables/useTabId';
import { useTabLifecycle } from './composables/useTabLifecycle';
import { useToolSettings } from './composables/useToolSettings';

// 本地工具
import { calculateByteSize, formatFileSize, calculateHash } from './utils/byteUtils';
import { type EditorContentLanguage, debounce, detectInputLanguage, normalizeArchiveName } from './utils/common';
import { IDB_STORE_TAB_HEARTBEATS, MAX_SINGLE_ARCHIVE_SIZE, idbDelete } from './utils/idb';
import { SETTINGS_TXT_ZH, SETTINGS_TXT_EN, type SettingsTxt } from './utils/i18n';
import { detectIndentSize as detectIndentSizeRaw, reformatJsonIndentation } from './utils/indentUtils';
import { JSON_TOOL_EDITOR_HORIZONTAL_SCROLLBAR_THICKNESS, JSON_TOOL_EDITOR_SCROLLBAR_THICKNESS } from './utils/editorScrollbar';
import {
    JSON_TOOL_UNSAFE_LONG_LINE_THRESHOLD,
    getJsonToolLongLineViewOptions,
} from './utils/editorWordWrap';
import { sortJsonForDiff } from './utils/jsonDiffSort';
import { normalizeJsonNumberLiteral, restoreHighPrecisionInOutput, tryParseHighPrecisionWrapper, tryReadHighPrecisionWrapperObject, unwrapHighPrecisionForConvert } from './utils/jsonEngine';
import { calculateMaxLevel, detectIllegalEscapes } from './utils/jsonStructure';
import { unescapeJsonText, type JsonUnescapeMessageKind } from './utils/jsonUnescape';
import { getJsonToolThemeForLanguage } from './utils/monacoThemes';
import { ensureMonacoTextareaAttrs, type MonacoTextareaAttrObserver } from './utils/monacoTextareaAttrs';

const props = defineProps<{ locale?: 'zh' | 'en' }>();
const emit = defineEmits<{ switchLocale: [] }>();

const jsonToolApp = getCurrentInstance()?.appContext.app;
if (jsonToolApp) {
    [
        ElAlert,
        ElAutocomplete,
        ElButton,
        ElButtonGroup,
        ElCheckbox,
        ElCollapse,
        ElCollapseItem,
        ElCollapseTransition,
        ElDialog,
        ElDropdown,
        ElDropdownItem,
        ElDropdownMenu,
        ElEmpty,
        ElIcon,
        ElInput,
        ElInputNumber,
        ElOption,
        ElPopover,
        ElRadio,
        ElRadioButton,
        ElRadioGroup,
        ElSelect,
        ElSwitch,
        ElTable,
        ElTableColumn,
        ElTag,
        ElUpload,
    ].forEach((component) => {
        if (component.name && !jsonToolApp.component(component.name)) {
            jsonToolApp.component(component.name, component);
        }
    });
}

const settingsTxt = computed<SettingsTxt>(() => (props.locale === 'en' ? SETTINGS_TXT_EN : SETTINGS_TXT_ZH));
const appendErrorDetail = (base: string, detail?: string): string => (detail ? `${base}: ${detail}` : base);

type JsonConvertModule = typeof import('./utils/jsonConvert');
type JsonConvertErrorLike = Error & {
    code?: string;
    detail?: string;
};

let jsonConvertModulePromise: Promise<JsonConvertModule> | null = null;

const loadJsonConvertModule = (): Promise<JsonConvertModule> => {
    if (!jsonConvertModulePromise) {
        jsonConvertModulePromise = import('./utils/jsonConvert');
    }
    return jsonConvertModulePromise;
};

const isJsonConvertErrorLike = (error: unknown): error is JsonConvertErrorLike => {
    return error instanceof Error && error.name === 'JsonConvertError' && typeof (error as JsonConvertErrorLike).code === 'string';
};

const localizeConvertError = (error: unknown): string => {
    if (isJsonConvertErrorLike(error)) {
        switch (error.code) {
            case 'CONVERT_YAML_FAILED':
                return appendErrorDetail(settingsTxt.value.msgConvertYamlFail, error.detail);
            case 'CONVERT_TOML_FAILED':
                return appendErrorDetail(settingsTxt.value.msgConvertTomlFail, error.detail);
            case 'CONVERT_XML_FAILED':
                return appendErrorDetail(settingsTxt.value.msgConvertXmlFail, error.detail);
            case 'CONVERT_GO_FAILED':
                return appendErrorDetail(settingsTxt.value.msgConvertGoFail, error.detail);
            case 'CONVERT_TYPESCRIPT_FAILED':
                return appendErrorDetail(settingsTxt.value.msgConvertTypeScriptFail, error.detail);
            case 'COOKIE_INPUT_EMPTY':
                return settingsTxt.value.msgConvertCookieInputEmpty;
            case 'COOKIE_INPUT_IS_JSON':
                return settingsTxt.value.msgConvertCookieInputIsJson;
            case 'COOKIE_NO_VALID_PAIRS':
                return settingsTxt.value.msgConvertCookieNoValidPairs;
            case 'COOKIE_INVALID_FORMAT':
                return appendErrorDetail(settingsTxt.value.msgConvertCookieInvalidFormat, error.detail);
        }
    }
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return settingsTxt.value.msgUnknownError;
};

// ==================== 常量与全局状态 ====================
const MAX_FILE_SIZE = 30 * 1024 * 1024; // 文件大小限制：30MB
const LARGE_EDITOR_LINE_THRESHOLD = 300000;
const LARGE_EDITOR_CHAR_THRESHOLD = 8 * 1024 * 1024;
const JSON_PREVIEW_TOKENIZATION_MAX_LINES = 50000;
const JSON_PREVIEW_TOKENIZATION_MAX_CHARS = LARGE_EDITOR_CHAR_THRESHOLD;
const JSON_FOLDING_MAXIMUM_REGIONS = 10000000;
const FOLDING_INFO_DOM_OBSERVER_MAX_LINES = LARGE_EDITOR_LINE_THRESHOLD;
const outputType = ref<'json' | 'yaml' | 'toml' | 'xml' | 'go' | 'typescript' | 'text'>('json'); // 当前输出类型的状态
const maxLevel = ref(0); // 最大层级
const inputContentLanguage = ref<EditorContentLanguage>('json');
const maxFoldableLevel = ref<number | null>(null); // 编辑器当前实际可折叠的最大层级
const selectedLevel = ref<number>(0); // 当前选中的层级
const isResizing = ref(false); // 是否正在调整宽度控制
const leftPanelWidth = ref(50); // 面板宽度控制（实时值，用于布局）
const stableLeftPanelWidth = ref(50); // 稳定宽度值，用于计算按钮显示状态（防抖更新）
const dataMaskingDialogVisible = ref(false); // 数据脱敏对话框相关状态
const archiveNameDialogVisible = ref(false); // 是否显示“保存存档”对话框

// 批量加 / 去前后缀对话框相关状态
type AffixMode = 'none' | 'add' | 'remove';
const affixDialogVisible = ref(false);
const affixPrefixMode = ref<AffixMode>('none');
const affixSuffixMode = ref<AffixMode>('none');
const affixPrefixValue = ref('');
const affixSuffixValue = ref('');
const archiveNameDialogTitle = ref('保存存档'); // 对话框标题文本
const archiveNameDialogInputValue = ref(''); // 对话框输入的当前值（存档名称）
const archiveNameDialogPlaceholder = ref('例如：测试数据1'); // 对话框输入框的占位符文本示例
const archiveNameDialogExcludeId = ref<string>(''); // 编辑时排除的存档ID（用于避免与自身重复）
const archiveNameDialogCallback = ref<((name: string) => void) | null>(null); // 确认时调用的回调函数
const isInputDragActive = ref(false);
const inputDragEnterDepth = ref(0);
const isInputMaximized = ref(false); // 编辑区域是否最大化
const isOutputMaximized = ref(false); // 预览区域是否最大化
const editorsInitialized = ref(false);

// 切换编辑区域最大化状态
const toggleInputMaximize = () => {
    // 演示模式下禁用面板最大化（双击面板头），避免 Popover 锚点突变导致引导错位
    if (isDemoMode.value) return;
    if (isInputMaximized.value) {
        // 从最大化恢复均分
        isInputMaximized.value = false;
        isOutputMaximized.value = false;
        leftPanelWidth.value = 50;
        stableLeftPanelWidth.value = 50;
    } else {
        // 最大化编辑区域
        isInputMaximized.value = true;
        isOutputMaximized.value = false;
        leftPanelWidth.value = 100;
        stableLeftPanelWidth.value = 100;
    }
    nextTick(() => {
        updateEditorLayout();
    });
};

// 切换预览区域最大化状态
const toggleOutputMaximize = () => {
    // 演示模式下禁用面板最大化（双击面板头），避免 Popover 锚点突变导致引导错位
    if (isDemoMode.value) return;
    if (isOutputMaximized.value) {
        // 从最大化恢复均分
        isInputMaximized.value = false;
        isOutputMaximized.value = false;
        leftPanelWidth.value = 50;
        stableLeftPanelWidth.value = 50;
    } else {
        // 最大化预览区域
        isInputMaximized.value = false;
        isOutputMaximized.value = true;
        leftPanelWidth.value = 0;
        stableLeftPanelWidth.value = 0;
    }
    nextTick(() => {
        updateEditorLayout();
    });
};

// ==================== 设置管理（已抽离至 composables/useToolSettings） ====================
// 所有持久化偏好（按钮可见性、字体、缩进、排序、minimap、stickyScroll 等）均由 useToolSettings
// 末尾解除初始化抑制。下方解构后的 ref 名称与原代码保持完全一致，模板与下游逻辑不需要修改。
const {
    indentSize,
    recursiveUnescape,
    wordWrap,
    fontSize,
    arrayNewLine,
    preserveNumberLiterals,
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
    markInitialized: markSettingsInitialized,
} = useToolSettings();

const {
    ensureMonacoLanguageRegistered,
    loadMonacoLanguageContribution,
    initializeMonacoEnvironment,
} = useMonacoLanguageRegistry(themeMode);

const isLongLineWrapLocked = ref(false);
const inputHasUnsafeLongLine = ref(false);
const outputHasUnsafeLongLine = ref(false);
// wordWrap=true 的历史语义是“单行显示”。保护状态只覆盖有效值，不改写用户的持久化偏好。
const effectiveWordWrap = computed({
    get: () => (isLongLineWrapLocked.value ? false : wordWrap.value),
    set: (value: boolean) => {
        if (!isLongLineWrapLocked.value) {
            wordWrap.value = value;
        }
    },
});

const toggleThemeMode = () => {
    themeMode.value = themeMode.value === 'dark' ? 'light' : 'dark';
};

const switchJsonToolLocale = () => {
    emit('switchLocale');
};

const jsonEngine = useJsonEngine({
    indentSize,
    arrayNewLine,
    preserveNumberLiterals,
    encodingMode,
});

const themeRootClass = computed(() => (themeMode.value === 'dark' ? 'theme-dark' : 'theme-light'));

watch(
    themeMode,
    (mode) => {
        if (typeof document === 'undefined') return;
        document.body.classList.toggle('json-tool-theme-dark', mode === 'dark');
    },
    { immediate: true },
);

onBeforeUnmount(() => {
    if (typeof document !== 'undefined') {
        document.body.classList.remove('json-tool-theme-dark');
    }
});

const inputEditorErrors = ref<monaco.editor.IMarker[]>([]);
const currentErrorIndex = ref(-1);
const currentInputLineCount = ref(1);

const countLinesWithoutSplit = (text: string): number => {
    if (!text) return 1;
    let count = 1;
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 10) count++;
    }
    return count;
};

// Esc 退出 Diff，恢复普通编辑器。
const handleEscapeKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && diffMode.isDiffMode.value) {
        void diffMode.exitDiffMode();
    }
};

// ==================== Diff 模式管理 ====================
// 仅保留页面级状态：进入 diff 前的普通编辑器内容快照（用于退出后恢复）。
let normalModeInputSnapshot = '';
let normalModeOutputSnapshot = '';
let normalModeInputViewState: monaco.editor.ICodeEditorViewState | null = null;
let normalModeOutputViewState: monaco.editor.ICodeEditorViewState | null = null;

// ==================== Tab/Storage（IndexedDB + 标签页隔离） ====================
const { tabId, runtimeInstanceId, isTabPageClosing, setupTabIdChannel, ensureUniqueTabIdForThisPage, disposeTabIdChannel } = useTabId();

const { setupTabGcChannel, startTabHeartbeat, stopTabHeartbeat, garbageCollectClosedTabs, disposeTabGcChannel } = useTabLifecycle({
    tabId,
    runtimeInstanceId,
    isTabPageClosing,
});

const getOutputEditorLanguage = () => {
    switch (outputType.value) {
        case 'yaml':
            return 'yaml';
        case 'toml':
            return 'toml';
        case 'xml':
            return 'xml';
        case 'go':
            return 'go';
        case 'typescript':
            return 'typescript';
        case 'text':
            return 'plaintext';
        default:
            return 'json';
    }
};

const cacheNormalEditorsState = () => {
    normalModeInputSnapshot = inputEditor?.getValue() || '';
    normalModeOutputSnapshot = outputEditor?.getValue() || '';
    normalModeInputViewState = inputEditor?.saveViewState() || null;
    normalModeOutputViewState = outputEditor?.saveViewState() || null;
};

const destroyNormalEditors = () => {
    cancelPendingLevelAnalysis();
    if (inputEditorResizeObserver) {
        inputEditorResizeObserver.disconnect();
        inputEditorResizeObserver = null;
    }
    if (inputEditorTextareaAttrObserver) {
        inputEditorTextareaAttrObserver.disconnect();
        inputEditorTextareaAttrObserver = null;
    }
    if (outputEditorResizeObserver) {
        outputEditorResizeObserver.disconnect();
        outputEditorResizeObserver = null;
    }
    if (outputEditorTextareaAttrObserver) {
        outputEditorTextareaAttrObserver.disconnect();
        outputEditorTextareaAttrObserver = null;
    }
    if (inputMarkersListener) {
        inputMarkersListener.dispose();
        inputMarkersListener = null;
    }
    if (inputEditor) {
        diffMode.clearInputSendToDiffContextKeys();
        disposeInputEditorWithModel();
    }
    if (outputEditor) {
        disposeOutputEditorWithModel();
    }
    editorsInitialized.value = false;
    inputEditorErrors.value = [];
    currentErrorIndex.value = -1;
    inputEditorStatus.value = '';
    outputEditorStatus.value = '';
};

const restoreNormalEditors = async () => {
    await nextTick();
    if (!inputEditorContainer.value || !outputEditorContainer.value) return;

    createInputEditor();
    createOutputEditor();
    configureInputEditor();
    configureOutputEditor();

    if (inputEditor) {
        setInputEditorValue(normalModeInputSnapshot, detectInputLanguage(normalModeInputSnapshot));
    }
    if (outputEditor) {
        setOutputEditorValue(
            normalModeOutputSnapshot,
            getOutputEditorLanguage(),
            outputType.value === 'json',
            outputType.value === 'go' ? 4 : outputType.value === 'typescript' ? 2 : undefined,
        );
    }

    initializeEditorLayout();
    setupResizeObservers();
    refreshInputEditorErrors();

    nextTick(() => {
        if (normalModeInputViewState) {
            inputEditor?.restoreViewState(normalModeInputViewState);
        }
        if (normalModeOutputViewState) {
            outputEditor?.restoreViewState(normalModeOutputViewState);
        }
        if (inputEditor) {
            updateLineNumberWidth(inputEditor);
            updateEditorHeight(inputEditor);
        }
        if (outputEditor) {
            updateLineNumberWidth(outputEditor);
            updateEditorHeight(outputEditor);
        }
        refreshEditorStatus(inputEditor, inputEditorStatus);
        refreshEditorStatus(outputEditor, outputEditorStatus);
    });
};

// ==================== Diff 模式 composable ====================
// 工具函数 / 通知函数 / preprocessJSON / jsonEngine service 都在文件后段声明，
// 这里全部用 lambda 包一层延迟绑定，避免 TDZ。
const diffMode = useDiffMode({
    settingsTxt,
    locale: computed(() => props.locale),
    tabId,
    isTabPageClosing,
    showMinimap,
    fontSize,
    wordWrap: effectiveWordWrap,
    themeMode,
    diffSortArrays,
    sortOrder,
    showMessageSuccess: (msg) => showMessageSuccess(msg),
    showMessageWarning: (msg) => showMessageWarning(msg),
    showMessageError: (msg) => showMessageError(msg),
    getInputEditor: () => inputEditor,
    cacheNormalEditorsState: () => cacheNormalEditorsState(),
    destroyNormalEditors: () => destroyNormalEditors(),
    restoreNormalEditors: () => restoreNormalEditors(),
    trackEditorFocus: (editor) => trackEditorFocus(editor),
    setupDoubleClickSelectString: (editor, copy) => setupDoubleClickSelectString(editor, copy),
    registerClipboardActions: (editor) => registerClipboardActions(editor),
    registerEncodingActions: (editor) => registerEncodingActions(editor),
    filterBuiltinContextMenuActions: (editor, hiddenIds) => filterBuiltinContextMenuActions(editor, hiddenIds),
    setupSelectionListener: (editor, statusRef) => setupSelectionListener(editor, statusRef),
    updateLineNumberWidth: (editor) => updateLineNumberWidth(editor),
    detectIndentSize: (content) => detectIndentSizeWrapper(content),
    onBeforeDisposeEditor: (editor) => {
        if (lastFocusedEditor === editor) lastFocusedEditor = null;
    },
    formatJsonValue: (value: string) => {
        return jsonEngine.formatInput(value).formatted;
    },
    sortJsonForDiffValue: (value: string, sortArrays: boolean, order) => {
        const result = preprocessJSON(value, { preserveNumberLiterals: true });
        const sorted = sortJsonForDiff(result.data, { sortArrays, sortOrder: order });
        return jsonEngine.stringify(sorted, result.escapeMap, {
            arrayNewLine: true,
            encodingMode: false,
        });
    },
});

let jsonSort: UseJsonSortReturn | null = null;
let jsonSortPromise: Promise<UseJsonSortReturn> | null = null;

const fieldSortDialogVisible = ref(false);
const sortRootPath = ref('');
const sortFieldName = ref('');
const fieldSortTarget = ref<'input' | 'diff-left' | 'diff-right'>('input');
const isDemoMode = ref(false);
const demoGuideVisible = ref(false);
const currentDemoStepData = ref<any>(null);
const demoPopoverAnchor = ref<HTMLElement | null>(null);
const demoPopoverPlacement = ref<DemoPopoverPlacement>('right-start');
const demoStepsCount = ref(0);
const currentDemoStep = ref(0);

type PathSuggestionCallback = (suggestions: PathSuggestion[]) => void;

const createJsonSort = async (): Promise<UseJsonSortReturn> => {
    const jsonSortModule = await import('./composables/useJsonSort');
    return jsonSortModule.useJsonSort({
        settingsTxt,
        sortMethod,
        sortOrder,
        getInputEditor: () => inputEditor,
        getOutputEditor: () => outputEditor,
        getDiffSideEditor: (side: 'left' | 'right') => diffMode.getDiffSideEditor(side),
        isDiffMode: diffMode.isDiffMode,
        enterDiffMode: () => diffMode.enterDiffMode(),
        exitDiffMode: () => diffMode.exitDiffMode(),
        updateDiffEditorOptions: (options: monaco.editor.IEditorOptions) => diffMode.updateDiffEditorOptions(options),
        ensureProcessingFeatureAvailable: () => ensureProcessingFeatureAvailable(),
        showMessageSuccess: (msg: string) => showMessageSuccess(msg),
        showMessageError: (msg: string) => showMessageError(msg),
        preprocessJSON: (input: string, options?: { preserveNumberLiterals?: boolean; encodingMode?: boolean }) => preprocessJSON(input, options),
        formatJsonResult: (data: any, escapeMap: any) => {
            const formatted = jsonEngine.stringify(data, escapeMap, {
                arrayNewLine: true,
                encodingMode: false,
            });
            return formatted.replace(/\\u([0-9a-fA-F]{4})/g, '\\u$1');
        },
        formatDemoResult: (data: any, _originalData: any) => {
            const formatted = stringifyJsonValueForCurrentSettings(data, 2, { preserveNumberLiterals: true });
            return formatted.replace(/\\u([0-9a-fA-F]{4})/g, '\\\\u$1');
        },
        writeOutputJson: (content: string) => {
            setOutputEditorValue(content, 'json', true);
            if (shouldPrecomputeFoldingInfo(content.length)) {
                schedulePrecomputeFoldingInfo(content, getFoldingInfoPrecomputeDelay(content.length)).catch(() => {
                    /* 静默处理 */
                });
            } else {
                clearOutputFoldingInfo();
            }
        },
        setOutputTypeJson: () => {
            outputType.value = 'json';
        },
        clearOutputEditor: () => {
            clearOutputFoldingInfo();
            setOutputEditorValue('', 'json', true);
        },
        clearOutputFoldingInfo: () => clearOutputFoldingInfo(),
        updateEditorHeight: (editor: monaco.editor.IStandaloneCodeEditor) => updateEditorHeight(editor),
        updateLineNumberWidth: (editor: monaco.editor.IStandaloneCodeEditor) => updateLineNumberWidth(editor),
        state: {
            fieldSortDialogVisible,
            sortRootPath,
            sortFieldName,
            fieldSortTarget,
            isDemoMode,
            demoGuideVisible,
            currentDemoStepData,
            demoPopoverAnchor,
            demoPopoverPlacement,
            demoStepsCount,
            currentDemoStep,
        },
    });
};

const ensureJsonSort = async (): Promise<UseJsonSortReturn> => {
    if (jsonSort) return jsonSort;
    if (!jsonSortPromise) {
        jsonSortPromise = createJsonSort().then((instance) => {
            jsonSort = instance;
            return instance;
        });
    }
    return jsonSortPromise;
};

const queryRootPaths = (queryString: string, cb: PathSuggestionCallback) => {
    void ensureJsonSort()
        .then((sort) => sort.queryRootPaths(queryString, cb))
        .catch(() => cb([]));
};

const queryFieldPathsFromScope = (queryString: string, cb: PathSuggestionCallback) => {
    void ensureJsonSort()
        .then((sort) => sort.queryFieldPathsFromScope(queryString, cb))
        .catch(() => cb([]));
};

const handleRootPathSelect = (item: Record<string, any>) => {
    void ensureJsonSort().then((sort) => sort.handleRootPathSelect(item as PathSuggestion));
};
const handleRootPathInput = (value: string | number) => {
    void ensureJsonSort().then((sort) => sort.handleRootPathInput(value));
};
const handleRootPathKeydown = (event: KeyboardEvent) => {
    void ensureJsonSort().then((sort) => sort.handleRootPathKeydown(event));
};
const handleFieldPathSelect = (item: Record<string, any>) => {
    void ensureJsonSort().then((sort) => sort.handleFieldPathSelect(item as PathSuggestion));
};
const handleFieldPathInput = (value: string | number) => {
    void ensureJsonSort().then((sort) => sort.handleFieldPathInput(value));
};
const handleFieldPathKeydown = (event: KeyboardEvent) => {
    void ensureJsonSort().then((sort) => sort.handleFieldPathKeydown(event));
};
const getTypeLabel = (type?: string) => jsonSort?.getTypeLabel(type ?? '') ?? '';
const showFieldSortDemo = () => {
    void ensureJsonSort().then((sort) => sort.showFieldSortDemo());
};
const executeFieldSort = () => {
    void ensureJsonSort().then((sort) => sort.executeFieldSort());
};
const endDemoMode = () => {
    void ensureJsonSort().then((sort) => sort.endDemoMode());
};
const applySort = async () => {
    const sort = await ensureJsonSort();
    sort.applySort();
};

const jsonToolSettingsDialog = useJsonToolSettingsDialog({
    wordWrap: effectiveWordWrap,
    fontSize,
    indentSize,
    arrayNewLine,
    showMinimap,
    stickyScroll,
    enableDiagnostics,
    preferredStickyScroll,
    preferredEnableDiagnostics,
    buttonVisibility,
    selectedLevel,
    getInputEditor: () => inputEditor,
    getOutputEditor: () => outputEditor,
    isDiffMode: diffMode.isDiffMode,
    updateDiffEditorOptions: (options) => diffMode.updateDiffEditorOptions(options),
    scheduleDiffEditorLayout: () => diffMode.scheduleDiffEditorLayout(),
    scheduleDiffRecompute: () => diffMode.scheduleDiffRecompute(),
    updateEditorLayout: () => updateEditorLayout(),
    configureJsonSchemaSupport: () => configureJsonSchemaSupport(),
    refreshInputEditorErrors: () => refreshInputEditorErrors(),
    checkToolBarScroll: () => checkToolBarScroll(),
});

const { settingsDialogVisible, settingsCollapseActiveNames, updateWordWrap, updateFontSize, updateMinimap, updateStickyScroll, openSettingsDialog } =
    jsonToolSettingsDialog;

provide(DIFF_MODE_INJECTION_KEY, diffMode);

const { inputHasContent, shouldShowFirstUseGuide, dismissFirstUseGuide, loadFirstUseSample } = useJsonToolFirstUseGuide({
    locale: computed(() => props.locale),
    editorsInitialized,
    isDiffMode: diffMode.isDiffMode,
    isInputDragActive,
    getInputEditor: () => inputEditor,
    showEditorNotInitError: () => showMessageError(settingsTxt.value.msgEditorNotInit),
    formatJson: () => formatJSON(),
});

onMounted(() => {
    setupTabIdChannel();
    setupTabGcChannel();
    void (async () => {
        await ensureUniqueTabIdForThisPage();
        // 启动心跳，让其他 tab 知道本 tab 还活着
        startTabHeartbeat();
        // 启动后异步执行一次 GC：清理所有已关闭 tab 留下的存档与 diff 草稿
        void garbageCollectClosedTabs();
        await diffMode.loadDiffDraftSnapshot();
        await loadArchives();
    })();
});

onBeforeUnmount(() => {
    isTabPageClosing.value = true;
    stopTabHeartbeat();
    // 同步删除自己的 heartbeat，让其他 tab 启动 GC 时能立刻清理本 tab 数据
    if (tabId.value) {
        void idbDelete(IDB_STORE_TAB_HEARTBEATS, tabId.value).catch(() => {
            /* ignore */
        });
    }
    disposeTabIdChannel();
    disposeTabGcChannel();
});

const detectIndentSizeWrapper = (content: string, fallback: number = indentSize.value): number => detectIndentSizeRaw(content, fallback);

const getDisplayIndentSizeForContent = (language: string, content: string, fallback: number = indentSize.value): number => {
    if (language !== 'json') return fallback;
    return detectIndentSizeWrapper(content, fallback);
};

const updateModelDisplayOptions = (
    model: monaco.editor.ITextModel,
    displayIndentSize: number,
    insertSpaces: boolean = true,
) => {
    const options: monaco.editor.ITextModelUpdateOptions = {
        tabSize: displayIndentSize,
        indentSize: displayIndentSize,
        insertSpaces,
    };

    model.updateOptions(options);
};

const ensureModelLanguage = (model: monaco.editor.ITextModel, language: string) => {
    ensureMonacoLanguageRegistered(language);
    if (model.getLanguageId() !== language) {
        monaco.editor.setModelLanguage(model, language);
    }
};

const updateEditorDisplayIndentOptions = (editor: monaco.editor.IStandaloneCodeEditor, displayIndentSize: number) => {
    editor.updateOptions({ tabSize: displayIndentSize, indentSize: displayIndentSize } as monaco.editor.IEditorOptions);
};

const syncEditorDisplayOptions = (
    editor: monaco.editor.IStandaloneCodeEditor,
    language?: string,
    fallbackIndentSize: number = indentSize.value,
    content?: string,
): number => {
    const model = editor.getModel();
    const resolvedLanguage = language ?? model?.getLanguageId() ?? 'json';
    const value = content ?? model?.getValue() ?? '';
    const displayIndentSize = getDisplayIndentSizeForContent(resolvedLanguage, value, fallbackIndentSize);

    if (model && !model.isDisposed()) {
        updateModelDisplayOptions(model, displayIndentSize);
    }
    updateEditorDisplayIndentOptions(editor, displayIndentSize);

    return displayIndentSize;
};

const forceJsonModelTokenization = (model: monaco.editor.ITextModel | null) => {
    if (!model || model.isDisposed() || model.getLanguageId() !== 'json') return;

    const lineCount = model.getLineCount();
    const contentLength = model.getValueLength();
    if (lineCount > JSON_PREVIEW_TOKENIZATION_MAX_LINES || contentLength > JSON_PREVIEW_TOKENIZATION_MAX_CHARS) return;

    const tokenization = (model as any).tokenization;
    if (!tokenization?.forceTokenization) return;

    tokenization.resetTokenization?.();
    tokenization.forceTokenization(lineCount);
};

const inputEditorContainer = ref<HTMLElement | null>(null); // 输入编辑器容器
const outputEditorContainer = ref<HTMLElement | null>(null); // 输出编辑器容器
const mainEditorContainer = ref<HTMLElement | null>(null); // 普通模式左右编辑器外层容器
const editorContainerWidth = ref(0); // 编辑器容器宽度，用于计算按钮显示状态
const toolBarRef = ref<HTMLElement | null>(null); // 工具栏容器引用
const canScrollLeft = ref(false); // 是否可以向左滚动
const canScrollRight = ref(false); // 是否可以向右滚动
const {
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
    onArchivePressStart,
    onArchiveDragStart,
    onArchiveDragEnter,
    onArchiveDragOver,
    onArchiveListDragOver,
    onArchiveListDrop,
    onArchiveDrop,
    onArchiveDragEnd,
} = useJsonArchives({
    tabId,
    settingsTxt,
    inputEditorContainer,
    updateEditorLayouts: (updateOutputEditor) => updateEditorLayouts(updateOutputEditor),
});
// syncScrollEnabled 已由 useToolSettings 管理（在文件顶部解构）
let inputEditor: monaco.editor.IStandaloneCodeEditor | null = null; // 输入编辑器实例
let outputEditor: monaco.editor.IStandaloneCodeEditor | null = null; // 输出编辑器实例
type LongLineEditorSide = 'input' | 'output';
const longLineDetectionRevision: Record<LongLineEditorSide, number> = { input: 0, output: 0 };

const syncLongLineWrapLock = () => {
    const shouldLock = inputHasUnsafeLongLine.value || outputHasUnsafeLongLine.value;
    if (shouldLock === isLongLineWrapLocked.value) return;

    isLongLineWrapLocked.value = shouldLock;
    updateWordWrap();

    if (shouldLock) {
        const locale = props.locale === 'en' ? 'en-US' : 'zh-CN';
        showMessageWarning(settingsTxt.value.msgLongLineWrapForced(JSON_TOOL_UNSAFE_LONG_LINE_THRESHOLD.toLocaleString(locale)), 7000);
    }
};

const setUnsafeLongLinePresence = (side: LongLineEditorSide, hasUnsafeLongLine: boolean) => {
    const target = side === 'input' ? inputHasUnsafeLongLine : outputHasUnsafeLongLine;
    if (target.value === hasUnsafeLongLine) return;
    target.value = hasUnsafeLongLine;
    syncLongLineWrapLock();
};

// 大文件按时间片扫描，避免为了判断是否存在一条超长行而阻塞百万行文件的主线程。
// 单行转义结果走同步快路径，因此会在 Monaco 首次渲染前立即开启保护。
const scheduleUnsafeLongLineDetection = (side: LongLineEditorSide, editor: monaco.editor.IStandaloneCodeEditor | null) => {
    const revision = ++longLineDetectionRevision[side];
    const model = editor?.getModel();
    if (!model || model.isDisposed()) {
        setUnsafeLongLinePresence(side, false);
        return;
    }

    if (model.getValueLength() <= JSON_TOOL_UNSAFE_LONG_LINE_THRESHOLD) {
        setUnsafeLongLinePresence(side, false);
        return;
    }

    const lineCount = model.getLineCount();
    if (lineCount === 1) {
        setUnsafeLongLinePresence(side, model.getLineLength(1) > JSON_TOOL_UNSAFE_LONG_LINE_THRESHOLD);
        return;
    }

    let lineNumber = 1;
    const scanTimeSlice = () => {
        if (longLineDetectionRevision[side] !== revision || model.isDisposed() || editor?.getModel() !== model) return;

        const startedAt = performance.now();
        let inspected = 0;
        while (lineNumber <= lineCount && inspected < 50000) {
            if (model.getLineLength(lineNumber) > JSON_TOOL_UNSAFE_LONG_LINE_THRESHOLD) {
                setUnsafeLongLinePresence(side, true);
                return;
            }
            lineNumber++;
            inspected++;
            if ((inspected & 1023) === 0 && performance.now() - startedAt >= 8) break;
        }

        if (lineNumber > lineCount) {
            setUnsafeLongLinePresence(side, false);
            return;
        }
        window.setTimeout(scanTimeSlice, 0);
    };

    scanTimeSlice();
};

let inputEditorResizeObserver: ResizeObserver | null = null; // 输入编辑器容器大小监听器
let inputEditorTextareaAttrObserver: MonacoTextareaAttrObserver | null = null;
const {
    getFoldingSummaryIndex,
    cancelFoldingInfoWorker,
    resetPrecomputedFoldingInfo,
    clearOutputFoldingInfo,
    precomputeFoldingInfo,
    schedulePrecomputeFoldingInfo,
    shouldPrecomputeFoldingInfo,
    getFoldingInfoPrecomputeDelay,
} = useJsonFoldingSummaryPrecompute({
    getOutputEditor: () => outputEditor as any,
});

const { isFoldLevelDisabled, isSelectedFoldLevelDisabled, resolveMaxFoldableLevel, refreshMaxFoldableLevel, foldByIndentation } = useJsonFoldingLevels({
    selectedLevel,
    maxFoldableLevel,
    getOutputEditor: () => outputEditor,
});

let outputEditorResizeObserver: ResizeObserver | null = null; // 输出编辑器容器大小监听器
let outputEditorTextareaAttrObserver: MonacoTextareaAttrObserver | null = null;
let stableWidthUpdateTimer: ReturnType<typeof setTimeout> | null = null; // 稳定宽度更新定时器

// 编辑器状态栏信息
const inputEditorStatus = ref('');
const outputEditorStatus = ref('');
// 注：diff 左右两侧的状态栏文本由 useDiffMode composable 内部维护，
// 通过 DIFF_MODE_INJECTION_KEY 提供给 JsonToolDiffPane 子组件读取。

const refreshEditorStatus = (editor: monaco.editor.IStandaloneCodeEditor | null, statusRef: { value: string }) => {
    nextTick(() => updateEditorStatus(editor, statusRef));
};

const disposeTextModel = (model: monaco.editor.ITextModel | null | undefined) => {
    if (model && !model.isDisposed()) {
        model.dispose();
    }
};

const disposeOutputEditorWithModel = () => {
    if (!outputEditor) return;

    const model = outputEditor.getModel();
    outputEditor.dispose();
    disposeTextModel(model);
    outputEditor = null;
};

const disposeInputEditorWithModel = () => {
    if (!inputEditor) return;

    const model = inputEditor.getModel();
    inputEditor.dispose();
    disposeTextModel(model);
    inputEditor = null;
};

const shouldUsePreparedJsonModel = (content: string): boolean => {
    if (content.length > JSON_PREVIEW_TOKENIZATION_MAX_CHARS) return false;
    return countLinesWithoutSplit(content) <= JSON_PREVIEW_TOKENIZATION_MAX_LINES;
};

const setOutputEditorValue = (
    content: string,
    language: string = 'json',
    enableLargeFileFolding: boolean = language === 'json',
    customIndentSize?: number,
): boolean => {
    if (!outputEditor) return false;

    const resolvedLanguage = language === 'text' ? 'plaintext' : language;

    if (resolvedLanguage === 'json' && shouldUsePreparedJsonModel(content)) {
        const previousModel = outputEditor.getModel();
        const displayIndentSize = getDisplayIndentSizeForContent(resolvedLanguage, content, customIndentSize ?? indentSize.value);
        const nextModel = monaco.editor.createModel(content, resolvedLanguage);

        updateModelDisplayOptions(nextModel, displayIndentSize);
        forceJsonModelTokenization(nextModel);
        outputEditor.setModel(nextModel);

        if (previousModel !== nextModel) {
            disposeTextModel(previousModel);
        }
    } else {
        outputEditor.setValue(content);
    }

    updateOutputEditorConfig(resolvedLanguage, enableLargeFileFolding, customIndentSize);
    updateLineNumberWidth(outputEditor);
    updateEditorHeight(outputEditor);
    refreshEditorStatus(outputEditor, outputEditorStatus);
    return true;
};

// 折叠操作锁定状态（防止并发折叠）
let isFoldOperationLocked = false;

// 拖动相关状态（提升到外层作用域，避免每次拖动创建新变量）
let resizeState: {
    initialX: number;
    initialPercentage: number;
    container: HTMLElement;
    rect: DOMRect;
    minWidthPercent: number;
    maxWidthPercent: number;
    minWidthPx: number;
    pointerId: number | null;
    pointerCaptureElement: HTMLElement | null;
    // 预览区域滚动位置（用于在拖动过程中保持滚动内容位置不变）
    outputScrollLeft: number; // 拖动开始时的水平滚动位置
    outputScrollTop: number; // 拖动开始时的垂直滚动位置
} | null = null;

const getMainEditorContainer = (): HTMLElement | null => {
    const container = mainEditorContainer.value;
    if (container?.isConnected) {
        return container;
    }

    return document.querySelector('.json-tool-container > .editor-container:not(.diff-editor-container)') as HTMLElement | null;
};

const getResizeContainerFromEvent = (event?: Event): HTMLElement | null => {
    const currentTarget = event?.currentTarget;
    if (currentTarget instanceof HTMLElement) {
        const container = currentTarget.closest('.editor-container');
        if (container instanceof HTMLElement && container.isConnected) {
            return container;
        }
    }

    return getMainEditorContainer();
};

const isUsableLayoutSize = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

// 防抖更新稳定宽度值，避免极快拖动时按钮状态频繁切换
const updateStableWidth = () => {
    // 清除之前的定时器
    if (stableWidthUpdateTimer) {
        clearTimeout(stableWidthUpdateTimer);
    }
    // 延迟更新稳定宽度值（100ms后），确保拖动稳定后才更新按钮显示状态
    stableWidthUpdateTimer = setTimeout(() => {
        stableLeftPanelWidth.value = leftPanelWidth.value;
    }, 100);
};

// 按钮显示临界宽度（像素）：标题 + 两个按钮 + gap + padding 的总宽度
// 计算："编辑区域"(约60px) + "清空"按钮(约70px) + "上传"按钮(约70px) + gap(12px) + padding(30px) ≈ 242px
// 设置为 260px 以确保有足够余量，避免换行
const BUTTON_MIN_WIDTH = 260;

// 计算属性：判断编辑区域是否显示按钮
// 非拖动时使用稳定宽度值，避免频繁计算
const showInputActions = computed(() => {
    if (editorContainerWidth.value === 0) return true; // 初始化时显示

    // 拖动时使用实时宽度，确保按钮立即响应（解决标题换行问题）
    // 非拖动时使用稳定宽度，避免不必要的计算
    const widthToUse = isResizing.value ? leftPanelWidth.value : stableLeftPanelWidth.value;
    const leftPanelWidthPx = (widthToUse / 100) * editorContainerWidth.value;

    // 宽度小于临界值时立即隐藏按钮，确保标题不换行
    return leftPanelWidthPx >= BUTTON_MIN_WIDTH;
});

// 计算属性：判断预览区域是否显示按钮
// 非拖动时使用稳定宽度值，避免频繁计算
const showOutputActions = computed(() => {
    if (editorContainerWidth.value === 0) return true; // 初始化时显示

    // 拖动时使用实时宽度，确保按钮立即响应（解决标题换行问题）
    // 非拖动时使用稳定宽度，避免不必要的计算
    const widthToUse = isResizing.value ? leftPanelWidth.value : stableLeftPanelWidth.value;
    const rightPanelWidthPx = ((100 - widthToUse) / 100) * editorContainerWidth.value;

    // 宽度小于临界值时立即隐藏按钮，确保标题不换行
    return rightPanelWidthPx >= BUTTON_MIN_WIDTH;
});

// 更新编辑器行号宽度
const updateLineNumberWidth = (editor: monaco.editor.IStandaloneCodeEditor | null) => {
    if (!editor) return;

    const lineCount = editor.getModel()?.getLineCount() || 0;
    const digitCount = lineCount < 99 ? 2 : String(lineCount).length;
    const minChars = digitCount + 1;

    editor.updateOptions({
        lineNumbers: 'on',
        lineNumbersMinChars: minChars,
    });

    // 必须调用 layout() 才能让行号宽度更新生效
    editor.layout();
};

// 更新编辑器高度
const updateEditorHeight = (editor: monaco.editor.IStandaloneCodeEditor | null) => {
    if (!editor) return;

    // 获取 Monaco 编辑器实例的容器（.monaco-editor-instance）
    const editorInstance = editor.getContainerDomNode();

    // 获取父容器（.monaco-editor-container），这是实际控制高度的容器
    const editorContainer = editorInstance.parentElement;
    if (!editorContainer) return;

    // 使用父容器的高度，确保编辑器不会超出容器范围
    const containerHeight = editorContainer.clientHeight;
    const containerWidth = editorContainer.clientWidth;
    if (!isUsableLayoutSize(containerWidth) || !isUsableLayoutSize(containerHeight)) {
        return;
    }

    // 使用容器高度和宽度
    editor.layout({
        width: containerWidth,
        height: containerHeight,
    });
};

// 更新编辑器布局
const updateEditorLayout = () => {
    updateEditorHeight(inputEditor);
    updateEditorHeight(outputEditor);
};

const getEditorLineCount = (editor: monaco.editor.IStandaloneCodeEditor | null) => editor?.getModel()?.getLineCount() || 1;

const getLargeFileOptions = (enableLargeFileFolding: boolean) =>
    enableLargeFileFolding
        ? {
              foldingMaximumRegions: JSON_FOLDING_MAXIMUM_REGIONS,
              largeFileOptimizations: true,
          }
        : {};

const isLargeEditorContent = (lineCount: number, contentLength: number) =>
    lineCount >= LARGE_EDITOR_LINE_THRESHOLD || contentLength >= LARGE_EDITOR_CHAR_THRESHOLD;

// 保留普通引导线，只有聚焦且启用括号引导线时才显示激活效果。
const getEditorGuideOptions = (enableBracketPairs: boolean, isFocused: boolean): monaco.editor.IGuidesOptions => ({
    indentation: true,
    bracketPairs: enableBracketPairs,
    bracketPairsHorizontal: enableBracketPairs && isFocused ? 'active' : false,
    highlightActiveBracketPair: enableBracketPairs && isFocused,
    highlightActiveIndentation: enableBracketPairs && isFocused,
});

const syncEditorGuideFocus = (editor: monaco.editor.IStandaloneCodeEditor) => {
    const enableBracketPairs = editor.getOption(monaco.editor.EditorOption.guides).bracketPairs !== false;
    editor.updateOptions({ guides: getEditorGuideOptions(enableBracketPairs, editor.hasWidgetFocus()) });
};

// 异步扫描尚未完成前，用户也可能点击 Monaco 的 “Show more”。捕获危险长度并立即进入
// 强制换行保护；安全长度继续交给 Monaco 原生 longLinesHelper 展开。
const handleUnsafeLongLineMouseDown = (event: MouseEvent, side: 'input' | 'output') => {
    const element = event.target instanceof Element ? event.target : null;
    if (!element?.closest('.mtkoverflow')) return;

    const editor = side === 'input' ? inputEditor : outputEditor;
    const model = editor?.getModel();
    if (!editor || !model || model.isDisposed()) return;

    const mouseTarget = editor.getTargetAtClientPoint(event.clientX, event.clientY);
    const lineNumber = mouseTarget?.position?.lineNumber;
    const lineLength = lineNumber ? model.getLineLength(lineNumber) : model.getLineCount() === 1 ? model.getLineLength(1) : model.getValueLength();
    if (lineLength <= JSON_TOOL_UNSAFE_LONG_LINE_THRESHOLD) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    setUnsafeLongLinePresence(side, true);
};

const ensureProcessingFeatureAvailable = () => true;

const ensureCollapseFeatureAvailable = () => true;

const nonJsonIndentationFoldingLanguages = new Set<EditorContentLanguage | 'typescript'>(['yaml', 'toml', 'xml', 'html', 'css', 'plaintext', 'typescript']);

const getFoldingStrategyForLanguage = (language: string) => {
    return nonJsonIndentationFoldingLanguages.has(language as EditorContentLanguage) ? ('indentation' as const) : ('auto' as const);
};

// 获取编辑器配置
const getEditorOptions = (
    size: number,
    isReadOnly: boolean = false,
    language: string = 'json',
    enableLargeFileFolding: boolean = false,
    lineCount: number = 1,
    contentLength: number = 0,
    isFocused: boolean = false,
) => {
    const isLargeEditor = isLargeEditorContent(lineCount, contentLength);

    return {
        // 基础配置
        value: '',
        language,
        theme: getJsonToolThemeForLanguage(language, themeMode.value),
        readOnly: isReadOnly,
        cursorBlinking: 'blink' as const, // 确保光标闪烁
        cursorStyle: 'line' as const, // 细线光标
        renderLineHighlightOnlyWhenFocus: true, // 仅在编辑器聚焦时显示当前行高亮

        // 外观配置
        // 当前行高亮只绘制一个可见行，性能成本很低；大文件模式也保留，
        // 否则用户在数十万行内容中很难确认光标所在位置。
        renderLineHighlight: 'line' as const,
        minimap: { enabled: !isLargeEditor && showMinimap.value },
        lineNumbers: 'on' as const, // 启用行号
        roundedSelection: false, // 启用圆角选择
        renderIndentGuides: true, // 始终显示缩进指南线
        lineDecorationsWidth: 2, // 缩小行号与折叠箭头之间的 gutter 间距
        renderWhitespace: 'none' as const, // 禁用空白字符显示
        contextmenu: true, // 输入区和只读预览区都使用 Monaco 右键菜单；内置项通过 filterBuiltinContextMenuActions 过滤

        // 滚动配置
        scrollBeyondLastLine: false, // 禁止滚动超过最后一行
        smoothScrolling: !isLargeEditor,
        fixedOverflowWidgets: true, // 使溢出窗口(如提示、自动完成)固定显示
        stickyScroll: { enabled: !isLargeEditor && stickyScroll.value },
        padding: { bottom: 0 },

        // 横向滚动条按需显示但不占内容高度，避免底部固定留白和折叠时高度跳变。
        scrollbar: {
            horizontal: 'auto' as const,
            verticalScrollbarSize: JSON_TOOL_EDITOR_SCROLLBAR_THICKNESS,
            horizontalScrollbarSize: JSON_TOOL_EDITOR_HORIZONTAL_SCROLLBAR_THICKNESS,
            verticalSliderSize: JSON_TOOL_EDITOR_SCROLLBAR_THICKNESS,
            horizontalSliderSize: JSON_TOOL_EDITOR_HORIZONTAL_SCROLLBAR_THICKNESS,
            ignoreHorizontalScrollbarInContentHeight: true,
            useShadows: false,
        },

        // 折叠配置
        folding: true, // 启用代码折叠功能（这是基础配置，必须开启）
        foldingStrategy: getFoldingStrategyForLanguage(language),
        ...getLargeFileOptions(enableLargeFileFolding),

        // 编辑器配置
        links: !isLargeEditor,
        tabSize: size, //  使用传入的大小作为Tab宽度
        indentSize: size, // 使用传入的大小作为缩进宽度
        ...getJsonToolLongLineViewOptions(effectiveWordWrap.value),
        fontSize: fontSize.value, // 字体大小设置
        lineHeight: 16, // 设置行高为16px，与光标高度保持一致
        autoClosingBrackets: 'languageDefined' as const, // 根据语言自动闭合括号
        autoClosingQuotes: 'languageDefined' as const, // 根据语言自动闭合引号
        formatOnPaste: false, // 启用粘贴时自动格式化
        maxUndoRedoEntries: 100, // 历史记录可撤销/重做的最大步数为100
        useTabStops: false, // 禁用TabStop
        maxTokenizationLineLength: isLargeEditor ? 200000 : 20000000,
        selectionHighlight: !isLargeEditor,
        occurrencesHighlight: isLargeEditor ? ('off' as const) : ('singleFile' as const),
        renderValidationDecorations: isLargeEditor && isReadOnly ? ('off' as const) : ('on' as const),
        matchBrackets: isLargeEditor ? ('near' as const) : ('always' as const),
        guides: getEditorGuideOptions(!isLargeEditor, isFocused),
        bracketPairColorization: {
            enabled: !isLargeEditor,
        },

        // 添加可访问性支持配置
        quickSuggestions: false,
        find: {
            // 配置查找组件
            addExtraSpaceOnTop: false, // 查找框顶部不添加额外空间
            autoFindInSelection: 'multiline' as const, // 不自动在选择区域内查找
            seedSearchStringFromSelection: 'always' as const, // 不使用选择内容作为查找初始内容
            globalFindClipboard: false, // 禁用全局查找剪贴板
        },

        // Unicode 高亮配置 - 禁用中文等非基本ASCII字符的黄色方框高亮
        unicodeHighlight: { ambiguousCharacters: false },
    };
};

const syncEditorLargeFileOptions = (editor: monaco.editor.IStandaloneCodeEditor | null, enableLargeFileFolding: boolean = false) => {
    if (!editor) return;
    const lineCount = getEditorLineCount(editor);
    const contentLength = editor.getModel()?.getValueLength() ?? 0;
    const isLargeEditor = isLargeEditorContent(lineCount, contentLength);
    editor.updateOptions({
        ...getLargeFileOptions(enableLargeFileFolding),
        // 动态进入或退出大文件模式时都保留当前行背景，与初始化选项一致。
        renderLineHighlight: 'line' as const,
        minimap: { enabled: !isLargeEditor && showMinimap.value },
        smoothScrolling: !isLargeEditor,
        stickyScroll: { enabled: !isLargeEditor && stickyScroll.value },
        links: !isLargeEditor,
        ...getJsonToolLongLineViewOptions(effectiveWordWrap.value),
        maxTokenizationLineLength: isLargeEditor ? 200000 : 20000000,
        selectionHighlight: !isLargeEditor,
        occurrencesHighlight: isLargeEditor ? ('off' as const) : ('singleFile' as const),
        matchBrackets: isLargeEditor ? ('near' as const) : ('always' as const),
        guides: getEditorGuideOptions(!isLargeEditor, editor.hasWidgetFocus()),
        bracketPairColorization: {
            enabled: !isLargeEditor,
        },
    });
};

const getFoldLevelOptionLabel = (level: number): string => {
    if (isFoldLevelDisabled(level)) {
        return settingsTxt.value.levelLabel(level);
    }
    return settingsTxt.value.levelLabel(level);
};

const updateInputEditorConfig = (language?: EditorContentLanguage) => {
    if (!inputEditor) return;

    const resolvedLanguage = language ?? detectInputLanguage(inputEditor.getValue() || '');
    inputContentLanguage.value = resolvedLanguage;

    let displayIndentSize = indentSize.value;
    const model = inputEditor.getModel();
    if (model) {
        ensureModelLanguage(model, resolvedLanguage);
        monaco.editor.setTheme(getJsonToolThemeForLanguage(resolvedLanguage, themeMode.value));
        displayIndentSize = syncEditorDisplayOptions(inputEditor, resolvedLanguage, indentSize.value);

        if (resolvedLanguage !== 'json') {
            monaco.editor.setModelMarkers(model, 'json', []);
            inputEditorErrors.value = [];
            currentErrorIndex.value = -1;
        } else {
            configureJsonSchemaSupport();
        }
    }

    inputEditor.updateOptions(
        getEditorOptions(
            displayIndentSize,
            false,
            resolvedLanguage,
            true,
            getEditorLineCount(inputEditor),
            inputEditor.getModel()?.getValueLength() ?? 0,
            inputEditor.hasWidgetFocus(),
        ),
    );
    syncEditorDisplayOptions(inputEditor, resolvedLanguage, indentSize.value);
    if (resolvedLanguage === 'json') {
        forceJsonModelTokenization(inputEditor.getModel());
    }
    refreshInputEditorErrors();
    updateLineNumberWidth(inputEditor);
    updateEditorHeight(inputEditor);
};

// 更新输出编辑器配置（包括模型选项，确保缩进指南线正确显示）
const updateOutputEditorConfig = (language: string = 'json', enableLargeFileFolding: boolean = false, customIndentSize?: number) => {
    if (!outputEditor) return;

    const fallbackIndentSize = customIndentSize ?? indentSize.value;
    let displayIndentSize = fallbackIndentSize;
    const model = outputEditor.getModel();
    if (model) {
        ensureModelLanguage(model, language);
        monaco.editor.setTheme(getJsonToolThemeForLanguage(language, themeMode.value));
        displayIndentSize = getDisplayIndentSizeForContent(language, model.getValue(), fallbackIndentSize);
        updateModelDisplayOptions(model, displayIndentSize);
    }

    // 更新编辑器配置
    outputEditor.updateOptions(
        getEditorOptions(
            displayIndentSize,
            true,
            language,
            enableLargeFileFolding,
            getEditorLineCount(outputEditor),
            outputEditor.getModel()?.getValueLength() ?? 0,
            outputEditor.hasWidgetFocus(),
        ),
    );
    syncEditorDisplayOptions(outputEditor, language, fallbackIndentSize);
    if (language === 'json') {
        forceJsonModelTokenization(outputEditor.getModel());
    }

    updateLineNumberWidth(outputEditor);
    updateEditorHeight(outputEditor);
    refreshMaxFoldableLevel(language).catch(() => {});
};

const syncInputEditorIndentFromContent = () => {
    if (!inputEditor) return;

    const model = inputEditor.getModel();
    if (!model || model.isDisposed()) return;

    syncEditorDisplayOptions(inputEditor, model.getLanguageId(), indentSize.value, model.getValue());
};

const syncOutputEditorIndentFromContent = () => {
    if (!outputEditor) return;

    const model = outputEditor.getModel();
    if (!model || model.isDisposed()) return;

    syncEditorDisplayOptions(outputEditor, model.getLanguageId(), indentSize.value, model.getValue());
};

watch(themeMode, (mode) => {
    const activeThemeLanguage = inputContentLanguage.value === 'toml' || getOutputEditorLanguage() === 'toml' ? 'toml' : inputContentLanguage.value;
    monaco.editor.setTheme(getJsonToolThemeForLanguage(activeThemeLanguage, mode));
});

let lastFocusedEditor: monaco.editor.IStandaloneCodeEditor | null = null;

const trackEditorFocus = (editor: monaco.editor.IStandaloneCodeEditor) => {
    editor.onDidFocusEditorWidget(() => {
        lastFocusedEditor = editor;
    });
};

const openFindWidgetWithFocus = (editor: monaco.editor.IStandaloneCodeEditor) => {
    editor.focus();
    setTimeout(() => {
        const findController = editor.getContribution('editor.contrib.findController') as any;
        if (findController) {
            findController.start({
                forceRevealReplace: false,
                seedSearchStringFromSelection: 'always',
                shouldFocus: 1,
            });
        } else {
            editor.getAction('actions.find')?.run();
        }
        setTimeout(() => {
            const containers = [editor.getDomNode(), editor.getContainerDomNode()];
            for (const container of containers) {
                if (!container) continue;
                const findInput =
                    container.querySelector<HTMLTextAreaElement>('.find-widget .monaco-inputbox textarea') ||
                    container.querySelector<HTMLInputElement>('.find-widget .monaco-inputbox input');
                if (findInput) {
                    findInput.focus();
                    return;
                }
            }
        }, 50);
    }, 0);
};

const handleGlobalFind = (event: KeyboardEvent) => {
    if (!((event.metaKey || event.ctrlKey) && event.key === 'f')) return;

    const target = event.target as HTMLElement | null;
    if (!target) return;

    const isInsideJsonTool = target.closest('.json-tool-container');
    if (!isInsideJsonTool) return;

    event.preventDefault();
    event.stopPropagation();

    const inputPanel = inputEditorContainer.value?.closest('.editor-panel');
    const outputPanel = outputEditorContainer.value?.closest('.editor-panel');
    const diffLeftHost = diffMode.diffLeftEditorContainer.value?.closest('.diff-cell-left');
    const diffRightHost = diffMode.diffRightEditorContainer.value?.closest('.diff-cell-right');

    let targetEditor: monaco.editor.IStandaloneCodeEditor | null = null;

    if (diffMode.isDiffMode.value) {
        // Diff 模式：根据点击/聚焦位置定位到左右 diff 编辑器，
        // 兜底使用 lastFocusedEditor（已记录最近聚焦的 diff 编辑器），
        // 再不行则默认使用左侧 diff 编辑器。
        const dLeft = diffMode.getDiffLeftEditor();
        const dRight = diffMode.getDiffRightEditor();
        if (diffLeftHost && diffLeftHost.contains(target)) {
            targetEditor = dLeft;
        } else if (diffRightHost && diffRightHost.contains(target)) {
            targetEditor = dRight;
        } else if (lastFocusedEditor && (lastFocusedEditor === dLeft || lastFocusedEditor === dRight)) {
            targetEditor = lastFocusedEditor;
        } else {
            targetEditor = dLeft || dRight;
        }
    } else if (inputPanel && inputPanel.contains(target)) {
        targetEditor = inputEditor;
    } else if (outputPanel && outputPanel.contains(target)) {
        targetEditor = outputEditor;
    } else if (lastFocusedEditor) {
        targetEditor = lastFocusedEditor;
    } else {
        targetEditor = inputEditor;
    }

    if (targetEditor) {
        openFindWidgetWithFocus(targetEditor);
    }
};

// 设置折叠信息显示（在折叠区域显示 n keys 或 n items）
const setupFoldingInfoDisplay = (editor: monaco.editor.IStandaloneCodeEditor) => {
    setupJsonFoldingInfoDisplay(editor, {
        getSummaryIndex: getFoldingSummaryIndex,
        getOutputType: () => outputType.value,
        domObserverMaxLines: FOLDING_INFO_DOM_OBSERVER_MAX_LINES,
    });
};
const findStringRangeByAst = (model: monaco.editor.ITextModel, position: monaco.Position): monaco.Range | null => {
    const languageId = model.getLanguageId();
    if (languageId !== 'json') {
        return null;
    }

    const content = model.getValue();
    const root = parseTree(content, [], {
        allowTrailingComma: true,
        disallowComments: false,
        allowEmptyContent: true,
    });

    if (!root) {
        return null;
    }

    const maxOffset = content.length;
    const rawOffset = model.getOffsetAt(position);
    const candidateOffsets = Array.from(new Set([Math.min(rawOffset, maxOffset), Math.min(Math.max(rawOffset - 1, 0), maxOffset)]));

    const findInnermostStringNode = (node: JsonAstNode, targetOffset: number): JsonAstNode | null => {
        const nodeEnd = node.offset + node.length;
        const isWithinNode = targetOffset >= node.offset && targetOffset < nodeEnd;
        const isAtRightBoundary = targetOffset === nodeEnd;

        if (!isWithinNode && !isAtRightBoundary) {
            return null;
        }

        if (node.children) {
            for (const child of node.children) {
                const matched = findInnermostStringNode(child, targetOffset);
                if (matched) {
                    return matched;
                }
            }
        }

        if (node.type === 'string' && node.length >= 2) {
            return node;
        }

        return null;
    };

    for (const candidateOffset of candidateOffsets) {
        const matchedNode = findInnermostStringNode(root, candidateOffset);
        if (!matchedNode || matchedNode.length < 2) {
            continue;
        }

        const start = model.getPositionAt(matchedNode.offset);
        const end = model.getPositionAt(matchedNode.offset + matchedNode.length);
        return new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
    }

    return null;
};

// 兜底：按当前行扫描，查找字符串的完整范围（包括引号）
const findStringRangeByScan = (model: monaco.editor.ITextModel, position: monaco.Position): monaco.Range | null => {
    const lineNumber = position.lineNumber;
    const column = position.column;
    const lineContent = model.getLineContent(lineNumber);

    // Monaco 的 column 是从 1 开始的，转换为数组索引（从 0 开始）
    const currentIndex = column - 1;

    // 辅助函数：检查指定位置是否是转义的引号
    const isEscapedQuote = (index: number, content: string): boolean => {
        if (index <= 0) return false;
        let backslashCount = 0;
        let i = index - 1;
        // 向前查找连续的反斜杠
        while (i >= 0 && content[i] === '\\') {
            backslashCount++;
            i--;
        }
        // 如果反斜杠数量是奇数，说明引号被转义了
        return backslashCount % 2 === 1;
    };

    // 辅助函数：从指定位置向前查找最近的未转义的引号
    const findStartQuote = (startIndex: number, content: string): number | null => {
        for (let i = startIndex; i >= 0; i--) {
            if (content[i] === '"' && !isEscapedQuote(i, content)) {
                return i;
            }
        }
        return null;
    };

    // 辅助函数：从指定位置向后查找最近的未转义的引号
    const findEndQuote = (startIndex: number, content: string): number | null => {
        for (let i = startIndex; i < content.length; i++) {
            if (content[i] === '"' && !isEscapedQuote(i, content)) {
                return i;
            }
        }
        return null;
    };

    // 策略1: 如果当前位置是引号，判断它是开始还是结束
    if (currentIndex < lineContent.length && lineContent[currentIndex] === '"' && !isEscapedQuote(currentIndex, lineContent)) {
        // 尝试向后查找结束引号（假设这是开始引号）
        const endQuote = findEndQuote(currentIndex + 1, lineContent);
        if (endQuote !== null) {
            // 验证：检查这个范围是否包含当前位置
            if (currentIndex <= endQuote) {
                return new monaco.Range(lineNumber, currentIndex + 1, lineNumber, endQuote + 2);
            }
        }

        // 尝试向前查找开始引号（假设这是结束引号）
        const startQuote = findStartQuote(currentIndex - 1, lineContent);
        if (startQuote !== null) {
            // 验证：检查这个范围是否包含当前位置
            if (startQuote <= currentIndex) {
                return new monaco.Range(lineNumber, startQuote + 1, lineNumber, currentIndex + 2);
            }
        }
    }

    // 策略2: 当前位置不是引号，或者引号匹配失败，从当前位置向前查找字符串开始
    // 首先找到最近的未转义引号（可能是开始或结束）
    let nearestQuote = findStartQuote(currentIndex, lineContent);

    if (nearestQuote === null) {
        return null;
    }

    // 尝试将这个引号作为开始引号，向后查找结束引号
    const endQuote = findEndQuote(nearestQuote + 1, lineContent);
    if (endQuote !== null) {
        // 验证：当前位置是否在这个字符串范围内（包括引号）
        if (currentIndex >= nearestQuote && currentIndex <= endQuote + 1) {
            return new monaco.Range(lineNumber, nearestQuote + 1, lineNumber, endQuote + 2);
        }
    }

    // 策略3: 如果上面的策略失败，尝试将最近的引号作为结束引号，向前查找开始引号
    const startQuote = findStartQuote(nearestQuote - 1, lineContent);
    if (startQuote !== null) {
        // 验证：当前位置是否在这个字符串范围内（包括引号）
        if (currentIndex >= startQuote && currentIndex <= nearestQuote + 1) {
            return new monaco.Range(lineNumber, startQuote + 1, lineNumber, nearestQuote + 2);
        }
    }

    return null;
};

// 查找字符串的完整范围（包括引号）
const findStringRange = (model: monaco.editor.ITextModel, position: monaco.Position): monaco.Range | null => {
    return findStringRangeByAst(model, position) ?? findStringRangeByScan(model, position);
};

const formatJsonPath = (segments: Array<string | number>): string => {
    if (segments.length === 0) return '';

    let result = '';
    for (const segment of segments) {
        if (typeof segment === 'number') {
            result += `[${segment}]`;
        } else if (!result) {
            result = segment;
        } else {
            result += `.${segment}`;
        }
    }
    return result;
};

const getJsonPathAtPosition = (model: monaco.editor.ITextModel, position: monaco.Position): string | null => {
    if (model.getLanguageId() !== 'json') {
        return null;
    }

    const content = model.getValue();
    const maxOffset = content.length;
    const rawOffset = model.getOffsetAt(position);
    const candidateOffsets = Array.from(new Set([Math.min(rawOffset, maxOffset), Math.min(Math.max(rawOffset - 1, 0), maxOffset)]));

    for (const candidateOffset of candidateOffsets) {
        const location = getLocation(content, candidateOffset);
        if (location.isAtPropertyKey) {
            const propertyPath = formatJsonPath(location.path.filter((segment) => segment !== ''));
            if (propertyPath) {
                return propertyPath;
            }
        }
        if (location.previousNode?.type === 'property') {
            const previousPropertyPath = formatJsonPath(location.path.filter((segment) => segment !== ''));
            if (previousPropertyPath) {
                return previousPropertyPath;
            }
        }
    }

    const root = parseTree(content, [], {
        allowTrailingComma: true,
        disallowComments: false,
        allowEmptyContent: true,
    });
    if (!root) {
        return null;
    }

    for (const candidateOffset of candidateOffsets) {
        const rawNode = findNodeAtOffset(root, candidateOffset, true);
        if (!rawNode) continue;

        const targetNode = rawNode.type === 'property' ? rawNode : rawNode.parent?.type === 'property' ? rawNode.parent : rawNode;

        const path = formatJsonPath(getNodePath(targetNode));
        if (path) {
            return path;
        }
    }

    return null;
};

// 复制文本到剪贴板
const copyToClipboard = async (text: string) => {
    try {
        // 优先使用现代 Clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            // 降级方案：使用传统方法（execCommand 已废弃，但作为兼容性降级方案）
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.readOnly = true; // 防止用户看到选中内容
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                // document.execCommand 已废弃，但作为降级方案仍可使用
                const success = document.execCommand('copy');
                if (!success) {
                    throw new Error('execCommand failed');
                }
            } catch (err) {
                // 忽略错误
            } finally {
                document.body.removeChild(textArea);
            }
        }
    } catch (err) {
        // 如果复制失败，不显示错误，静默处理
    }
};

// 更新编辑器状态栏信息
const updateEditorStatus = (editor: monaco.editor.IStandaloneCodeEditor | null, statusRef: { value: string }) => {
    if (!editor) {
        statusRef.value = '';
        return;
    }

    const model = editor.getModel();
    if (!model) {
        statusRef.value = '';
        return;
    }

    const totalLines = model.getLineCount();
    const selection = editor.getSelection();
    // 失焦时显示默认行列和实际总行数，后台更新也不能恢复旧光标或选区信息。
    if (!editor.hasWidgetFocus() || !selection) {
        statusRef.value = settingsTxt.value.statusCursor(1, 1, totalLines);
        return;
    }

    const startLine = selection.startLineNumber;
    const endLine = selection.endLineNumber;
    const startColumn = selection.startColumn;
    const endColumn = selection.endColumn;

    // 检查是否有选中内容（不是光标位置）
    const hasSelection = !selection.isEmpty();

    // 检查是否全选（从第1行第1列到最后一行的最后一列）
    const isFullSelection = hasSelection && startLine === 1 && startColumn === 1 && endLine === totalLines && endColumn === model.getLineMaxColumn(totalLines);

    if (hasSelection) {
        // 计算选中的行数
        const selectedLines = endLine - startLine + 1;

        // 使用 Monaco Editor 的 API 获取选中文本，然后计算字符数
        const selectedText = model.getValueInRange(selection);
        const selectedChars = selectedText.length;

        // 如果是全选，显示文件大小
        if (isFullSelection) {
            // 计算文件大小（UTF-8编码，中文字符占3字节，英文字符占1字节）
            const fileSizeBytes = new Blob([selectedText]).size;
            const fileSize = formatFileSize(fileSizeBytes);
            statusRef.value = settingsTxt.value.statusSelectedAll(selectedLines, selectedChars, fileSize);
            return;
        }

        // 对于非全选的选中内容，搜索匹配项（两个区域都支持）
        if (selectedText.trim()) {
            try {
                // 在整个文档中查找所有完全匹配的位置
                // findMatches 的 isRegex 为 false 时，searchString 为纯字面量，无需转义
                const matches = model.findMatches(selectedText, false, false, true, null, false, 1073741824);

                const matchCount = matches.length;

                // 格式化显示：行数 字符数 匹配数
                if (selectedLines === 1) {
                    if (matchCount > 1) {
                        statusRef.value = settingsTxt.value.statusSelectedCharsWithMatches(selectedChars, matchCount);
                    } else {
                        statusRef.value = settingsTxt.value.statusSelectedChars(selectedChars);
                    }
                } else {
                    if (matchCount > 1) {
                        statusRef.value = settingsTxt.value.statusSelectedLinesWithMatches(selectedLines, selectedChars, matchCount);
                    } else {
                        statusRef.value = settingsTxt.value.statusSelectedLines(selectedLines, selectedChars);
                    }
                }
            } catch (error) {
                // 如果搜索失败，回退到基本显示
                if (selectedLines === 1) {
                    statusRef.value = settingsTxt.value.statusSelectedChars(selectedChars);
                } else {
                    statusRef.value = settingsTxt.value.statusSelectedLines(selectedLines, selectedChars);
                }
            }
        } else {
            // 选中内容为空或只有空白字符，只显示基本信息
            if (selectedLines === 1) {
                statusRef.value = settingsTxt.value.statusSelectedChars(selectedChars);
            } else {
                statusRef.value = settingsTxt.value.statusSelectedLines(selectedLines, selectedChars);
            }
        }
    } else {
        // 没有选中，显示光标位置
        statusRef.value = settingsTxt.value.statusCursor(startLine, startColumn, totalLines);
    }
};

// 设置编辑器状态监听
const setupSelectionListener = (editor: monaco.editor.IStandaloneCodeEditor | null, statusRef: { value: string }) => {
    if (!editor) return [];

    // 使用组件焦点，保留编辑器内部查找等控件的状态显示。
    const focusDisposable = editor.onDidFocusEditorWidget(() => {
        syncEditorGuideFocus(editor);
        updateEditorStatus(editor, statusRef);
    });
    const blurDisposable = editor.onDidBlurEditorWidget(() => {
        syncEditorGuideFocus(editor);
        updateEditorStatus(editor, statusRef);
    });

    // 监听选择变化
    const selectionDisposable = editor.onDidChangeCursorSelection(() => {
        updateEditorStatus(editor, statusRef);
    });

    // 监听内容变化（更新总行数等信息）
    const contentDisposable = editor.onDidChangeModelContent(() => {
        updateEditorStatus(editor, statusRef);
    });

    // 监听模型替换，覆盖 setModel 写入路径。
    const modelDisposable = editor.onDidChangeModel(() => {
        updateEditorStatus(editor, statusRef);
    });

    // 初始化普通模式和 Diff 模式的引导线及状态。
    syncEditorGuideFocus(editor);
    updateEditorStatus(editor, statusRef);
    return [focusDisposable, blurDisposable, selectionDisposable, contentDisposable, modelDisposable];
};

watch(settingsTxt, () => {
    updateEditorStatus(inputEditor, inputEditorStatus);
    updateEditorStatus(outputEditor, outputEditorStatus);
    updateEditorStatus(diffMode.getDiffLeftEditor(), diffMode.diffLeftEditorStatus);
    updateEditorStatus(diffMode.getDiffRightEditor(), diffMode.diffRightEditorStatus);
});

// 设置双击选中整个字符串并复制功能
const setupDoubleClickSelectString = (editor: monaco.editor.IStandaloneCodeEditor, enableCopy: boolean = true) => {
    editor.onMouseDown((e: monaco.editor.IEditorMouseEvent) => {
        const currentPosition = e.target.position;

        if (!currentPosition) {
            return;
        }

        if (e.event.detail === 2) {
            const model = editor.getModel();
            if (!model) return;

            const clickPosition = new monaco.Position(currentPosition.lineNumber, currentPosition.column);

            setTimeout(() => {
                const stringRange = findStringRange(model, clickPosition);

                if (stringRange) {
                    const stringValueRange = new monaco.Range(
                        stringRange.startLineNumber,
                        stringRange.startColumn + 1, // 跳过开始引号
                        stringRange.endLineNumber,
                        stringRange.endColumn - 1, // 跳过结束引号
                    );

                    editor.setSelection(stringValueRange);

                    if (enableCopy) {
                        const stringValueText = model.getValueInRange(stringValueRange);
                        copyToClipboard(stringValueText);
                        showMessageSuccess('字符串已复制到剪贴板');
                    }
                }
            }, 10);
        }
    });
};

const HIDDEN_CONTEXT_MENU_COMMAND_IDS = [
    'editor.action.changeAll',
    'editor.action.clipboardCutAction',
    'editor.action.clipboardCopyAction',
    'editor.action.clipboardPasteAction',
];

const getEditorSelectedOrFullSource = (editor: monaco.editor.IStandaloneCodeEditor) => {
    const model = editor.getModel();
    if (!model) return null;
    const selection = editor.getSelection();
    if (selection && !selection.isEmpty()) {
        return {
            text: model.getValueInRange(selection),
            replaceRange: selection,
            isSelection: true,
        };
    }
    return {
        text: model.getValue(),
        replaceRange: null as monaco.Range | null,
        isSelection: false,
    };
};

const tryParseHighPrecisionLiteral = (value: any): string | null => {
    const literal = typeof value === 'string' ? tryParseHighPrecisionWrapper(value) : tryReadHighPrecisionWrapperObject(value);
    return literal === null ? null : normalizeJsonNumberLiteral(literal);
};

const formatJsonValueForContextAction = (data: any, escapeMap: Map<string, string> = new Map(), compressed: boolean = false): string => {
    return jsonEngine.stringify(data, escapeMap, {
        arrayNewLine: true,
        encodingMode: false,
    }, compressed).replace(/\\u([0-9a-fA-F]{4})/g, '\\u$1');
};

const buildArrayFromTextLines = (raw: string): string => {
    const lines = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    if (lines.length === 0) {
        throw new Error(settingsTxt.value.msgContextNoContent);
    }

    const isValidJsonArrayElement = (line: string): boolean => {
        try {
            JSON.parse(line);
            return true;
        } catch {
            return false;
        }
    };
    const elementLines = lines.map((line) => (isValidJsonArrayElement(line) ? line : JSON.stringify(line)));
    const indent = ' '.repeat(indentSize.value);
    return `[\n${elementLines.map((line) => `${indent}${line}`).join(',\n')}\n]`;
};

const transformLines = (raw: string, transform: (line: string) => string): string => {
    if (!raw.trim()) {
        throw new Error(settingsTxt.value.msgContextNoContent);
    }
    const lines = raw.split(/\r?\n/);
    // 文本若以换行结尾，split 会产生一个末尾空字符串。它代表的是"末尾换行"本身，
    // 不应该被加上前后缀（否则会凭空多出一行）。其余空行（首部或中间）都要参与 transform，
    // 这样"批量添加前后缀"对空行也能生效。
    const trailingEmpty = lines.length > 1 && lines[lines.length - 1] === '';
    return lines.map((line, idx) => (trailingEmpty && idx === lines.length - 1 ? line : transform(line))).join('\n');
};

const dedupeSimpleArray = (arr: any[]): any[] => {
    const seen = new Set<string>();
    const result: any[] = [];

    for (const item of arr) {
        let dedupeKey: string;
        if (item === null || item === undefined) {
            dedupeKey = 'null';
        } else if (typeof item === 'boolean') {
            dedupeKey = `boolean:${item}`;
        } else if (typeof item === 'number') {
            dedupeKey = `number:${String(item)}`;
        } else if (typeof item === 'string') {
            const highPrecisionLiteral = tryParseHighPrecisionLiteral(item);
            dedupeKey = highPrecisionLiteral !== null ? `number:${highPrecisionLiteral}` : `string:${item}`;
        } else {
            // 对象 / 数组：用紧凑 JSON 作为指纹，元素相同即视为重复。
            try {
                dedupeKey = `json:${JSON.stringify(item)}`;
            } catch {
                dedupeKey = `ref:${result.length}`; // 无法序列化时不去重，保留元素。
            }
        }

        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        result.push(item);
    }

    return result;
};

/**
 * 在任意层级的 JSON 树中提取指定 key 的 value：
 * - 数组节点继续递归每一项；
 * - 对象节点：先递归每个 value 寻找更深层的同名 key；
 * - 命中目标 key 时：值是简单类型（string/number/boolean/null）→ 收集；
 *                    值是复杂类型（对象/数组）→ 跳过并 +1，认为存在递归结构。
 */
const extractValuesByKey = (data: any, targetKey: string): { values: any[]; skippedComplex: number } => {
    const values: any[] = [];
    let skippedComplex = 0;

    const isComplex = (v: any) => v !== null && typeof v === 'object';

    const walk = (node: any) => {
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (!node || typeof node !== 'object') return;

        for (const [key, value] of Object.entries(node)) {
            if (key === targetKey) {
                if (isComplex(value)) {
                    skippedComplex += 1;
                } else {
                    values.push(value);
                }
            }
            // 即便命中目标 key，也继续往下走，以便处理嵌套同名 key 的情况。
            if (isComplex(value)) {
                walk(value);
            }
        }
    };

    walk(data);
    return { values, skippedComplex };
};

/**
 * 文本处理 / 数组处理菜单的统一写出口：写到预览区（outputEditor），
 * 不覆盖编辑区原内容。outputKind 决定预览的语言与高亮主题。
 * 当输出为 JSON 时，触发折叠区域统计的预计算，让折叠后能正确显示 n items / n keys；
 * 当输出为纯文本时，清掉之前 JSON 输出残留的折叠统计，避免错位。
 */
const writeProcessingResultToOutput = (text: string, outputKind: 'json' | 'text') => {
    if (!outputEditor) {
        showMessageError(settingsTxt.value.msgNoAvailableEditor);
        return false;
    }
    outputType.value = outputKind;
    setOutputEditorValue(text, outputKind === 'json' ? 'json' : 'plaintext', outputKind === 'json');
    if (outputKind === 'json') {
        if (shouldPrecomputeFoldingInfo(text.length)) {
            schedulePrecomputeFoldingInfo(text, getFoldingInfoPrecomputeDelay(text.length)).catch(() => {});
        } else {
            clearOutputFoldingInfo();
        }
    } else {
        clearOutputFoldingInfo();
    }
    return true;
};

// 右键菜单注册：拆分到 composables/useEditorContextMenu.ts。
// 这里只把当前作用域的 ref / 工具函数注入进去，拿回 6 个 register* + applyBatchAffix。
// 工具函数统一用 lambda 包一层延迟绑定，避免 TDZ —— 因为这些函数实现都在文件后段。
const {
    registerProcessingActions,
    registerInputDiffTransferActions,
    registerOutputDiffTransferActions,
    registerClipboardActions,
    registerReadonlyClipboardActions,
    registerEncodingActions,
    filterBuiltinContextMenuActions,
    applyBatchAffix,
} = useEditorContextMenu({
    settingsTxt,
    getInputEditor: () => inputEditor,
    sortMethod,
    sortOrder,
    affix: {
        dialogVisible: affixDialogVisible,
        prefixMode: affixPrefixMode,
        suffixMode: affixSuffixMode,
        prefixValue: affixPrefixValue,
        suffixValue: affixSuffixValue,
    },
    showMessageSuccess,
    showMessageWarning,
    showMessageError,
    writeProcessingResultToOutput: (text, kind) => writeProcessingResultToOutput(text, kind),
    getEditorSelectedOrFullSource: (editor) => getEditorSelectedOrFullSource(editor),
    transformLines: (raw, transform) => transformLines(raw, transform),
    buildArrayFromTextLines: (raw) => buildArrayFromTextLines(raw),
    preprocessJSON: (input, options) => preprocessJSON(input, options),
    formatJsonValueForContextAction: (data, escapeMap, compressed) => formatJsonValueForContextAction(data, escapeMap, compressed),
    dedupeSimpleArray: (arr) => dedupeSimpleArray(arr),
    extractValuesByKey: (data, key) => extractValuesByKey(data, key),
    sendInputContentToDiff: (side) => diffMode.sendInputContentToDiff(side),
    sendContentToDiff: (side, content, emptyMessage) => diffMode.sendContentToDiff(side, content, emptyMessage),
    setInputSendToDiffContextKeys: (left, right) => {
        diffMode.setInputSendToDiffContextKeys(left, right);
    },
    getJsonPathAtPosition: (model, position) => getJsonPathAtPosition(model, position),
    copyToClipboard: (text) => copyToClipboard(text),
});

// 添加窗口大小变化的处理函数
const handleResize = () => {
    const container = getMainEditorContainer();
    if (container) {
        editorContainerWidth.value = container.getBoundingClientRect().width;
    }
    updateEditorLayout();
    diffMode.scheduleDiffEditorLayout();
};

// 添加防抖函数

// 使用防抖处理 resize 事件
const debouncedResize = debounce(handleResize, 100);

// 输入区和预览区必须各自维护防抖任务。若共用同一个防抖器，连续执行
// “恢复输入内容 → 清空预览内容”时，预览区会取消输入区尚未执行的更新，
// 使大文件恢复后仍沿用演示数据的窄行号栏。
const debouncedUpdateInputLineNumberWidth = debounce(() => updateLineNumberWidth(inputEditor), 150);
const debouncedUpdateOutputLineNumberWidth = debounce(() => updateLineNumberWidth(outputEditor), 150);

const { cancelPendingLevelAnalysis, destroyLevelAnalysisWorker, scheduleInputLevelAnalysis } = useJsonLevelAnalysis({
    maxLevel,
    selectedLevel,
    inputContentLanguage,
    getInputEditor: () => inputEditor,
    getOutputEditor: () => outputEditor,
    updateInputEditorConfig: (language) => updateInputEditorConfig(language),
    preprocessJson: (input) => preprocessJSON(input).data,
    resetPrecomputedFoldingInfo,
    clearOutputFoldingInfo,
    clearOutputEditor: () => setOutputEditorValue('', 'json', true),
    showDepthLimitError: () => showMessageError(settingsTxt.value.msgJsonLevelTooDeep),
});

let inputMarkersListener: monaco.IDisposable | null = null;

const refreshInputEditorErrors = () => {
    const model = inputEditor?.getModel();
    if (!model || !enableDiagnostics.value || model.getLanguageId() !== 'json') {
        inputEditorErrors.value = [];
        currentErrorIndex.value = -1;
        return;
    }

    const markers = monaco.editor.getModelMarkers({ resource: model.uri });
    const errors = markers
        .filter((m) => m.severity === monaco.MarkerSeverity.Error)
        .sort((a, b) => a.startLineNumber - b.startLineNumber || a.startColumn - b.startColumn);

    inputEditorErrors.value = errors;
    if (errors.length === 0) {
        currentErrorIndex.value = -1;
        return;
    }
    if (currentErrorIndex.value < 0 || currentErrorIndex.value >= errors.length) {
        currentErrorIndex.value = 0;
    }
};

const refreshInputMarkersListener = () => {
    inputMarkersListener?.dispose();
    inputMarkersListener = null;

    const inputModel = inputEditor?.getModel();
    if (!inputModel) {
        refreshInputEditorErrors();
        return;
    }

    inputMarkersListener = monaco.editor.onDidChangeMarkers((uris) => {
        const hit = uris.some((u) => u.toString() === inputModel.uri.toString());
        if (!hit) return;
        refreshInputEditorErrors();
    });
    refreshInputEditorErrors();
};

const setInputEditorValue = (content: string, language: EditorContentLanguage = 'json'): boolean => {
    if (!inputEditor) return false;

    if (language === 'json' && shouldUsePreparedJsonModel(content)) {
        const previousModel = inputEditor.getModel();
        const displayIndentSize = getDisplayIndentSizeForContent('json', content, indentSize.value);
        const nextModel = monaco.editor.createModel(content, 'json');

        updateModelDisplayOptions(nextModel, displayIndentSize);
        forceJsonModelTokenization(nextModel);
        inputEditor.setModel(nextModel);

        if (previousModel !== nextModel) {
            disposeTextModel(previousModel);
        }
        refreshInputMarkersListener();
    } else {
        inputEditor.setValue(content);
    }

    inputContentLanguage.value = language;
    updateInputEditorConfig(language);
    currentInputLineCount.value = getEditorLineCount(inputEditor);
    const hasContent = content.length > 0;
    inputHasContent.value = hasContent;
    scheduleInputLevelAnalysis(hasContent);
    updateLineNumberWidth(inputEditor);
    updateEditorHeight(inputEditor);
    refreshEditorStatus(inputEditor, inputEditorStatus);
    return true;
};

const goToPrevError = () => {
    const errors = inputEditorErrors.value;
    if (!errors.length || !inputEditor) return;
    currentErrorIndex.value = currentErrorIndex.value <= 0 ? errors.length - 1 : currentErrorIndex.value - 1;
    jumpToError(errors[currentErrorIndex.value]);
};

const goToNextError = () => {
    const errors = inputEditorErrors.value;
    if (!errors.length || !inputEditor) return;
    currentErrorIndex.value = currentErrorIndex.value >= errors.length - 1 ? 0 : currentErrorIndex.value + 1;
    jumpToError(errors[currentErrorIndex.value]);
};

const jumpToError = (error: monaco.editor.IMarker) => {
    if (!inputEditor) return;
    const range = new monaco.Range(error.startLineNumber, error.startColumn, error.endLineNumber, error.endColumn);
    inputEditor.setSelection(range);
    inputEditor.revealRangeInCenter(range);
    inputEditor.focus();
};

// ==================== 自动保存设置到 localStorage（已抽离至 useToolSettings） ====================
// useToolSettings 内部已建立 deep watch 自动保存，这里不再重复声明。

// 创建输入编辑器
const createInputEditor = () => {
    if (!inputEditorContainer.value) return;

    const inputOptions = getEditorOptions(indentSize.value, false, inputContentLanguage.value, true, 1);
    inputEditor = monaco.editor.create(inputEditorContainer.value, inputOptions);
    currentInputLineCount.value = getEditorLineCount(inputEditor);

    inputEditorTextareaAttrObserver?.disconnect();
    inputEditorTextareaAttrObserver = ensureMonacoTextareaAttrs(inputEditorContainer.value, 'monaco-input-editor');

    const container = inputEditorContainer.value;
    nextTick(() => {
        inputEditorTextareaAttrObserver?.syncNow();

        // 监听粘贴事件，自动检测并调整缩进
        if (inputEditor) {
            const editor = inputEditor!;
            inputEditor.onDidPaste(() => {
                const model = editor.getModel();
                if (!model) return;
                syncEditorDisplayOptions(editor, model.getLanguageId(), indentSize.value, model.getValue());
            });
        }
    });

    refreshInputMarkersListener();
};

// 创建输出编辑器
const createOutputEditor = () => {
    if (!outputEditorContainer.value) return;

    // 默认启用大文件折叠优化（因为是输出编辑器，通常会处理较大的JSON）
    const options = getEditorOptions(indentSize.value, true, 'json', true);
    outputEditor = monaco.editor.create(outputEditorContainer.value, options);
    outputEditorTextareaAttrObserver?.disconnect();
    outputEditorTextareaAttrObserver = ensureMonacoTextareaAttrs(outputEditorContainer.value, 'monaco-output-editor');
    nextTick(() => {
        outputEditorTextareaAttrObserver?.syncNow();
    });
};

// 配置JSON Schema支持
const configureJsonSchemaSupport = () => {
    const model = inputEditor?.getModel();
    const isJsonModel = model?.getLanguageId() === 'json';

    // 关闭语法检查时，需要手动清除已有的 markers，否则红色波浪线不会消失
    if ((!enableDiagnostics.value || !isJsonModel) && model) {
        monaco.editor.setModelMarkers(model, 'json', []);
        inputEditorErrors.value = [];
        currentErrorIndex.value = -1;
    }

    // 配置JSON语言服务，提供更好的自动补全
    monaco.languages.json.jsonDefaults.setModeConfiguration({
        documentFormattingEdits: false,
        documentRangeFormattingEdits: false,
        completionItems: true, // 保留自动补全功能
        hovers: true,
        documentSymbols: true,
        tokens: true,
        colors: true,
        foldingRanges: true,
        diagnostics: enableDiagnostics.value, // 启用/关闭JSON语法检查和错误提示
        selectionRanges: true,
    });
};

// 配置输入编辑器
const configureInputEditor: () => void = () => {
    if (!inputEditor) return;

    // 配置JSON Schema支持
    configureJsonSchemaSupport();

    syncEditorDisplayOptions(inputEditor, 'json', indentSize.value, '');

    // 初始化时不加载数据，保持空白
    inputEditor.setValue('');
    inputHasContent.value = false;
    updateInputEditorConfig('json');
    maxLevel.value = 0;
    selectedLevel.value = 0;

    // 设置双击选中整个字符串（不复制到剪贴板）
    setupDoubleClickSelectString(inputEditor, false);

    trackEditorFocus(inputEditor);

    // 注册 Base64 / URL 编解码右键菜单（与 Diff 模式共用同一份注册逻辑）
    registerEncodingActions(inputEditor);
    registerInputDiffTransferActions(inputEditor);
    registerClipboardActions(inputEditor);
    registerProcessingActions(inputEditor);
    filterBuiltinContextMenuActions(inputEditor, HIDDEN_CONTEXT_MENU_COMMAND_IDS);

    // 设置选择变化监听
    setupSelectionListener(inputEditor, inputEditorStatus);

    // 监听输入变化
    let prevInputLineCount = getEditorLineCount(inputEditor);
    inputEditor.onDidChangeModel(() => {
        scheduleUnsafeLongLineDetection('input', inputEditor);
        prevInputLineCount = getEditorLineCount(inputEditor);
        currentInputLineCount.value = prevInputLineCount;
        refreshInputMarkersListener();
        syncInputEditorIndentFromContent();
        syncEditorLargeFileOptions(inputEditor, true);
        debouncedUpdateInputLineNumberWidth();
    });
    inputEditor.onDidChangeModelContent((e) => {
        scheduleUnsafeLongLineDetection('input', inputEditor);
        const model = inputEditor?.getModel();
        const lineCount = getEditorLineCount(inputEditor);
        currentInputLineCount.value = lineCount;

        const isFullReplace = e.changes.some((change) => {
            const replacedLines = change.range.endLineNumber - change.range.startLineNumber + 1;
            return replacedLines >= prevInputLineCount && change.text.includes('\n');
        });
        if (isFullReplace && lineCount < LARGE_EDITOR_LINE_THRESHOLD) {
            inputEditor?.updateOptions({ folding: false });
            nextTick(() => {
                inputEditor?.updateOptions({ folding: true });
            });
        }
        if (e.isUndoing || e.isRedoing || isFullReplace) {
            syncInputEditorIndentFromContent();
        }
        prevInputLineCount = lineCount;
        syncEditorLargeFileOptions(inputEditor, true);

        // 使用防抖更新行号宽度，避免频繁调用
        debouncedUpdateInputLineNumberWidth();
        const hasModelContent = Boolean((model?.getValueLength?.() ?? 0) > 0);
        inputHasContent.value = hasModelContent;
        scheduleInputLevelAnalysis(hasModelContent);
    });
};

// 配置输出编辑器
const configureOutputEditor: () => void = () => {
    if (!outputEditor) return;

    syncEditorDisplayOptions(outputEditor, 'json');
    // 设置双击选中整个字符串并复制功能
    setupDoubleClickSelectString(outputEditor);
    // 设置选择变化监听
    setupSelectionListener(outputEditor, outputEditorStatus);
    // 设置折叠信息显示
    setupFoldingInfoDisplay(outputEditor);
    trackEditorFocus(outputEditor);
    registerOutputDiffTransferActions(outputEditor);
    registerReadonlyClipboardActions(outputEditor);
    filterBuiltinContextMenuActions(outputEditor, HIDDEN_CONTEXT_MENU_COMMAND_IDS);

    let prevOutputLineCount = getEditorLineCount(outputEditor);
    outputEditor.onDidChangeModel(() => {
        scheduleUnsafeLongLineDetection('output', outputEditor);
        prevOutputLineCount = getEditorLineCount(outputEditor);
        syncOutputEditorIndentFromContent();
        syncEditorLargeFileOptions(outputEditor, outputType.value === 'json');
        debouncedUpdateOutputLineNumberWidth();
    });
    outputEditor.onDidChangeModelContent((e) => {
        scheduleUnsafeLongLineDetection('output', outputEditor);
        const lineCount = getEditorLineCount(outputEditor);
        const isFullReplace = e.changes.some((change) => {
            const replacedLines = change.range.endLineNumber - change.range.startLineNumber + 1;
            return replacedLines >= prevOutputLineCount && change.text.includes('\n');
        });

        if (e.isUndoing || e.isRedoing || isFullReplace) {
            syncOutputEditorIndentFromContent();
        }

        prevOutputLineCount = lineCount;
        syncEditorLargeFileOptions(outputEditor, outputType.value === 'json');
        debouncedUpdateOutputLineNumberWidth();
    });
};

// 使用Monaco Editor原生API的简单同步滚动
const syncScrollByNativeAPI = (sourceEditor: monaco.editor.IStandaloneCodeEditor, targetEditor: monaco.editor.IStandaloneCodeEditor) => {
    if (!sourceEditor || !targetEditor) return;

    try {
        // 获取源编辑器的滚动信息
        const sourceScrollTop = sourceEditor.getScrollTop();
        const sourceScrollLeft = sourceEditor.getScrollLeft();
        const sourceScrollHeight = sourceEditor.getScrollHeight();
        const targetScrollHeight = targetEditor.getScrollHeight();

        // 计算比例并同步滚动位置
        if (sourceScrollHeight > 0 && targetScrollHeight > 0) {
            const scrollRatio = sourceScrollTop / sourceScrollHeight;
            const targetScrollTop = Math.min(scrollRatio * targetScrollHeight, targetScrollHeight - (targetEditor.getDomNode()?.clientHeight || 0));

            // 使用Monaco Editor的原生API直接设置滚动位置
            targetEditor.setScrollTop(targetScrollTop);
            targetEditor.setScrollLeft(sourceScrollLeft);
        }
    } catch (error) {}
};

// 设置同步滚动功能
const setupSyncScroll = () => {
    if (!inputEditor || !outputEditor) return;

    let isSyncing = false; // 防止递归同步
    let scrollThrottleTimer: ReturnType<typeof setTimeout> | null = null; // 节流定时器

    // 输入编辑器滚动监听
    inputEditor.onDidScrollChange(() => {
        if (!syncScrollEnabled.value || isSyncing) return;
        if (!outputEditor) return;

        // 使用节流控制同步频率，避免快速滚动时的性能问题
        if (scrollThrottleTimer) return;

        isSyncing = true;

        // 使用Monaco Editor原生API进行简单同步
        if (inputEditor && outputEditor) {
            syncScrollByNativeAPI(inputEditor, outputEditor);
        }

        // 设置节流定时器（4ms ≈ 240fps）
        scrollThrottleTimer = setTimeout(() => {
            scrollThrottleTimer = null;
        }, 4);

        // 延迟重置同步标志，避免递归
        setTimeout(() => {
            isSyncing = false;
        }, 10);
    });

    // 输出编辑器滚动监听
    outputEditor.onDidScrollChange(() => {
        if (!syncScrollEnabled.value || isSyncing) return;
        if (!inputEditor) return;

        // 使用节流控制同步频率
        if (scrollThrottleTimer) return;

        isSyncing = true;

        // 使用Monaco Editor原生API进行简单同步
        if (inputEditor && outputEditor) {
            syncScrollByNativeAPI(outputEditor, inputEditor);
        }

        // 设置节流定时器（4ms ≈ 240fps）
        scrollThrottleTimer = setTimeout(() => {
            scrollThrottleTimer = null;
        }, 4);

        // 延迟重置同步标志，避免递归
        setTimeout(() => {
            isSyncing = false;
        }, 10);
    });
};

// 初始化编辑器布局
const initializeEditorLayout = () => {
    updateLineNumberWidth(inputEditor);
    updateLineNumberWidth(outputEditor);
    updateEditorHeight(inputEditor);
    updateEditorHeight(outputEditor);

    // 设置同步滚动
    setupSyncScroll();

    // 设置初始化成功标志
    editorsInitialized.value = true;
};

// 设置窗口resize监听器
const setupWindowResizeListener = () => {
    if (typeof window === 'undefined') return;
    window.addEventListener('resize', debouncedResize);
};

// 初始化容器宽度
const initializeContainerWidth = () => {
    setTimeout(() => {
        const container = getMainEditorContainer();
        if (container) {
            editorContainerWidth.value = container.getBoundingClientRect().width;
        }
    }, 300);
};

// 检查工具栏滚动状态（使用nextTick确保DOM更新后再检查）
const checkToolBarScroll = () => {
    nextTick(() => {
        if (!toolBarRef.value) {
            canScrollLeft.value = false;
            canScrollRight.value = false;
            return;
        }

        const { scrollLeft, scrollWidth, clientWidth } = toolBarRef.value;
        canScrollLeft.value = scrollLeft > 1; // 大于1是为了处理浮点数精度问题
        canScrollRight.value = scrollLeft < scrollWidth - clientWidth - 1; // 减1是为了处理浮点数精度问题
    });
};

// 处理工具栏滚动事件
const handleToolBarScroll = () => {
    checkToolBarScroll();
};

// 滚动工具栏
const scrollToolBar = (direction: 'left' | 'right') => {
    if (!toolBarRef.value) return;

    const scrollAmount = 200; // 每次滚动200px
    const currentScroll = toolBarRef.value.scrollLeft;
    const targetScroll = direction === 'left' ? currentScroll - scrollAmount : currentScroll + scrollAmount;

    toolBarRef.value.scrollTo({
        left: targetScroll,
        behavior: 'smooth',
    });
};

// 设置ResizeObserver
const setupResizeObservers = () => {
    if (typeof ResizeObserver === 'undefined') return;

    // 监听输入编辑器容器
    if (inputEditorContainer.value) {
        const inputContainer = inputEditorContainer.value.parentElement; // .monaco-editor-container
        if (inputContainer && !inputEditorResizeObserver) {
            inputEditorResizeObserver = new ResizeObserver((entries) => {
                // 立即同步 Monaco 布局，保证滚动条在拖动浏览器边界时紧贴容器边缘
                if (inputEditor) {
                    const entry = entries[0];
                    const contentRect = entry?.contentRect;
                    const width = contentRect ? contentRect.width : inputContainer.clientWidth;
                    const height = contentRect ? contentRect.height : inputContainer.clientHeight;
                    if (isUsableLayoutSize(width) && isUsableLayoutSize(height)) {
                        inputEditor.layout({ width, height });
                    }
                }
                // 继续触发其它与 resize 相关的防抖副作用（如尺寸状态、diff 布局等）
                debouncedResize();
            });
            inputEditorResizeObserver.observe(inputContainer);
        }
    }

    // 监听输出编辑器容器
    if (outputEditorContainer.value) {
        const outputContainer = outputEditorContainer.value.parentElement; // .monaco-editor-container
        if (outputContainer && !outputEditorResizeObserver) {
            outputEditorResizeObserver = new ResizeObserver((entries) => {
                // 立即同步 Monaco 布局，保证滚动条在拖动浏览器边界时紧贴容器边缘
                if (outputEditor) {
                    const entry = entries[0];
                    const contentRect = entry?.contentRect;
                    const width = contentRect ? contentRect.width : outputContainer.clientWidth;
                    const height = contentRect ? contentRect.height : outputContainer.clientHeight;
                    if (isUsableLayoutSize(width) && isUsableLayoutSize(height)) {
                        outputEditor.layout({ width, height });
                    }
                }
                debouncedResize();
            });
            outputEditorResizeObserver.observe(outputContainer);
        }
    }
};

// ==================== onMounted 辅助函数结束 ====================

let editorInitTimer: ReturnType<typeof setTimeout> | null = null;
let toolbarScrollTimer: ReturnType<typeof setTimeout> | null = null;
const pendingAnimationFrames = new Set<number>();

const requestTrackedAnimationFrame = (callback: FrameRequestCallback): number => {
    const frameId = requestAnimationFrame((time) => {
        pendingAnimationFrames.delete(frameId);
        callback(time);
    });
    pendingAnimationFrames.add(frameId);
    return frameId;
};

const waitForNextFrame = (): Promise<void> =>
    new Promise((resolve) => {
        requestTrackedAnimationFrame(() => resolve());
    });

const initializeNormalEditors = async () => {
    try {
        if (!inputEditorContainer.value || !outputEditorContainer.value) {
            return;
        }

        createInputEditor();
        configureInputEditor();

        await waitForNextFrame();

        if (!outputEditorContainer.value) {
            return;
        }

        createOutputEditor();
        configureOutputEditor();

        await waitForNextFrame();

        initializeEditorLayout();
        setupResizeObservers();

    } catch (error: any) {
        showMessageError('Monaco编辑器初始化失败: ' + error.message);
    }
};

// 在组件挂载时添加监听器
onMounted(async () => {
    // 确保在客户端环境下运行
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', handleEscapeKey);
    window.addEventListener('keydown', handleGlobalFind, true);

    // 初始化基础环境
    initializeMonacoEnvironment();

    // 添加延迟确保DOM完全渲染
    await nextTick();
    editorInitTimer = setTimeout(() => {
        void initializeNormalEditors();
    }, 120);

    // 设置监听器
    setupWindowResizeListener();
    initializeContainerWidth();

    // 初始化工具栏滚动检测
    toolbarScrollTimer = setTimeout(() => {
        checkToolBarScroll();
        // 监听窗口大小变化，更新滚动状态
        if (typeof ResizeObserver !== 'undefined' && toolBarRef.value) {
            const resizeObserver = new ResizeObserver(() => {
                checkToolBarScroll();
            });
            resizeObserver.observe(toolBarRef.value);

            // 监听窗口resize事件
            window.addEventListener('resize', checkToolBarScroll);
        }
    }, 300);

    // 初始化完成，允许自动保存设置
    markSettingsInitialized();
});

// 清理编辑器实例
onBeforeUnmount(() => {
    // 关闭所有消息提示，避免路由切换时消息提示仍然显示
    ElMessage.closeAll();
    destroyLevelAnalysisWorker();
    cancelFoldingInfoWorker();
    stopResize();
    if (editorInitTimer) {
        clearTimeout(editorInitTimer);
        editorInitTimer = null;
    }
    if (toolbarScrollTimer) {
        clearTimeout(toolbarScrollTimer);
        toolbarScrollTimer = null;
    }
    pendingAnimationFrames.forEach((frameId) => cancelAnimationFrame(frameId));
    pendingAnimationFrames.clear();

    // 移除resize事件监听器
    window.removeEventListener('resize', debouncedResize);
    window.removeEventListener('resize', checkToolBarScroll);
    window.removeEventListener('keydown', handleEscapeKey);
    window.removeEventListener('keydown', handleGlobalFind, true);

    // 清理 ResizeObserver
    if (inputEditorResizeObserver) {
        inputEditorResizeObserver.disconnect();
        inputEditorResizeObserver = null;
    }
    if (inputEditorTextareaAttrObserver) {
        inputEditorTextareaAttrObserver.disconnect();
        inputEditorTextareaAttrObserver = null;
    }
    if (outputEditorResizeObserver) {
        outputEditorResizeObserver.disconnect();
        outputEditorResizeObserver = null;
    }
    if (outputEditorTextareaAttrObserver) {
        outputEditorTextareaAttrObserver.disconnect();
        outputEditorTextareaAttrObserver = null;
    }

    diffMode.destroyDiffEditor();

    if (inputEditor) {
        diffMode.clearInputSendToDiffContextKeys();
        disposeInputEditorWithModel();
    }

    if (outputEditor) {
        disposeOutputEditorWithModel();
    }

    if (inputMarkersListener) {
        inputMarkersListener.dispose();
        inputMarkersListener = null;
    }
});

// 添加组件卸载时的资源释放
onUnmounted(() => {
    // 确保所有 worker 都被终止
    if (typeof window !== 'undefined' && window.MonacoEnvironment) {
        // @ts-ignore
        window.MonacoEnvironment = undefined;
    }
});

// 处理转换
const handleConvert = async (command: string) => {
    try {
        const value = inputEditor?.getValue() || '';
        if (!value.trim()) {
            showMessageError(settingsTxt.value.msgInputContentRequired);
            return;
        }

        // 处理 Cookie 转换
        if (command === 'cookie') {
            const { cookieToJSON } = await loadJsonConvertModule();
            const jsonStr = cookieToJSON(value);
            outputType.value = 'json';
            setOutputEditorValue(jsonStr, 'json', true);
            showMessageSuccess(settingsTxt.value.msgConvertCookieSuccess);
            return;
        }

        // 处理其他格式转换（不启用高精度浮点数，即使用户开启了设置）
        // 注意：转换到 YAML/TOML/XML/Go 是“语义转换”，需要按 JSON 规范解码字符串中的 \uXXXX。
        // 否则 preprocessJSON 会用私有区占位符保护 \uXXXX，导致结果里出现 ... 这类占位符字符。
        let parsed;
        try {
            const result = preprocessJSON(value, { preserveNumberLiterals: true, encodingMode: true });
            parsed = unwrapHighPrecisionForConvert(result.data);
        } catch (error) {
            showMessageError(settingsTxt.value.msgInvalidJson);
            return;
        }

        let result = '';
        let editorLanguage = 'json';
        const convertSuccessLabelMap: Record<string, string> = {
            yaml: 'YAML',
            toml: 'TOML',
            xml: 'XML',
            go: 'Go',
            typescript: 'TypeScript',
        };
        const jsonConvert = await loadJsonConvertModule();
        switch (command) {
            case 'yaml':
                outputType.value = 'yaml';
                editorLanguage = 'yaml';
                result = await jsonConvert.convertToYAML(parsed);
                break;
            case 'toml':
                outputType.value = 'toml';
                editorLanguage = 'toml';
                result = await jsonConvert.convertToTOML(parsed);
                break;
            case 'xml':
                outputType.value = 'xml';
                editorLanguage = 'xml';
                result = await jsonConvert.convertToXML(parsed);
                break;
            case 'go':
                outputType.value = 'go';
                editorLanguage = 'go';
                outputEditor?.getModel()?.updateOptions({ tabSize: 4, indentSize: 4 });
                result = jsonConvert.convertToGo(parsed);
                break;
            case 'typescript':
                outputType.value = 'typescript';
                editorLanguage = 'typescript';
                result = jsonConvert.convertToTypeScript(parsed);
                break;
            default:
                throw new Error(settingsTxt.value.msgConvertUnsupported);
        }

        // 还原数字精度哨兵：把 __HPN_START_xxx__...__HPN_END_xxx__ 以及可能被库加上的引号替换为原始数字字面量
        result = restoreHighPrecisionInOutput(result);

        if (outputEditor) {
            // 更新编辑器内容
            // Go 结构体保持 4 空格；TypeScript 使用 2 空格，更贴近前端常见输出。
            const customIndentSize = command === 'go' ? 4 : command === 'typescript' ? 2 : undefined;
            const enableLargeFile = editorLanguage === 'json';
            await loadMonacoLanguageContribution(editorLanguage);
            setOutputEditorValue(result, editorLanguage, enableLargeFile, customIndentSize);

            showMessageSuccess(settingsTxt.value.msgConvertSuccess(convertSuccessLabelMap[command] || command.toUpperCase()));
        }
    } catch (error: any) {
        showMessageError(settingsTxt.value.msgConvertFail(localizeConvertError(error)));
    }
};

// 兼容性函数 - 用于其他地方的JSON解析
const preprocessJSON = (input: string, options?: { preserveNumberLiterals?: boolean; encodingMode?: boolean }) => {
    return jsonEngine.parse(input, options);
};

const stringifyJsonValueForCurrentSettings = (
    data: any,
    indentSize: number,
    options?: { preserveNumberLiterals?: boolean; encodingMode?: boolean },
): string => {
    return jsonEngine.stringify(data, new Map<string, string>(), {
        indentSize,
        ...options,
    });
};

// 格式化 JSON
const formatJSON = () => {
    if (!ensureProcessingFeatureAvailable()) return;
    const startTime = performance.now();

    try {
        outputType.value = 'json';
        const value = inputEditor?.getValue() || '';

        if (!value.trim()) {
            showMessageError(settingsTxt.value.msgInputJsonRequired);
            return;
        }

        const startLineCount = currentInputLineCount.value || countLinesWithoutSplit(value);
        const { formatted } = jsonEngine.formatInput(value);

        setOutputEditorValue(formatted, 'json', true);

        const elapsed = performance.now() - startTime;
        if (startLineCount > 300000) {
            showMessageSuccess(settingsTxt.value.msgFormatSuccessWithTime(elapsed.toFixed(0)));
        } else {
            showMessageSuccess(settingsTxt.value.msgFormatSuccess);
        }

        // 折叠信息预计算放到格式化完成之后；大文本会切到 Worker，避免阻塞编辑器交互。
        if (shouldPrecomputeFoldingInfo(formatted.length)) {
            schedulePrecomputeFoldingInfo(formatted, getFoldingInfoPrecomputeDelay(formatted.length)).catch(() => {});
        } else {
            clearOutputFoldingInfo();
        }
    } catch (error: any) {
        showMessageError(settingsTxt.value.msgFormatFail(error.message));
    }
};

// 压缩 JSON
const compressJSON = () => {
    if (!ensureProcessingFeatureAvailable()) return;
    try {
        outputType.value = 'json';
        const value = inputEditor?.getValue() || '';
        if (!value.trim()) {
            showMessageError(settingsTxt.value.msgInputJsonRequired);
            return;
        }

        let compressed = '';
        try {
            compressed = jsonEngine.compressInput(value, {
                preserveNumberLiterals: preserveNumberLiterals.value,
                encodingMode: false,
            }).formatted;
        } catch (error) {
            showMessageError(settingsTxt.value.msgInvalidJson);
            return;
        }
        setOutputEditorValue(compressed, 'json', true);

        showMessageSuccess(settingsTxt.value.msgCompressSuccess);
    } catch (error: any) {
        showMessageError(settingsTxt.value.msgCompressFail(error.message));
    }
};

// 去除JSON转义字符
const unescapeJSON = (recursive: boolean = true) => {
    if (!ensureProcessingFeatureAvailable()) return;

    try {
        const value = inputEditor?.getValue() || '';
        if (!value.trim()) {
            showMessageError(settingsTxt.value.msgInputContentRequired);
            return;
        }
        outputType.value = 'json';

        const result = unescapeJsonText(value, {
            recursive,
            indentSize: indentSize.value,
            arrayNewLine: arrayNewLine.value,
            preserveNumberLiterals: true,
        });

        if (!result.ok) {
            setOutputEditorValue('', 'json', true);
            if (result.code === 'illegal-escape') {
                showMessageError(settingsTxt.value.msgUnescapeIllegalRejected);
            } else {
                showMessageError(settingsTxt.value.msgUnescapeInvalidJsonRejected);
            }
            if (result.hasInconsistentEscape) {
                showMessageWarning(settingsTxt.value.msgUnescapeInconsistentEscape);
            }
            return;
        }

        if (!writeProcessingResultToOutput(result.text, 'json')) return;

        const successMessageMap: Record<JsonUnescapeMessageKind, string> = {
            success: settingsTxt.value.msgUnescapeSuccess,
            'shallow-success': settingsTxt.value.msgUnescapeShallowSuccess,
            'double-success': settingsTxt.value.msgUnescapeDoubleSuccess,
            'not-detected': settingsTxt.value.msgUnescapeNotDetected,
        };

        if (result.hasInconsistentEscape) {
            showMessageWarning(settingsTxt.value.msgUnescapeInconsistentEscape);
        } else if (result.messageKind === 'not-detected') {
            showMessageWarning(successMessageMap[result.messageKind]);
        } else {
            showMessageSuccess(successMessageMap[result.messageKind]);
        }
    } catch (error: any) {
        showMessageError(settingsTxt.value.msgUnescapeFail(error.message));
    }
};

// 压缩并转义功能
const compressAndEscapeJSON = () => {
    if (!ensureProcessingFeatureAvailable()) return;
    try {
        const value = inputEditor?.getValue() || '';
        if (!value.trim()) {
            showMessageError(settingsTxt.value.msgInputJsonRequired);
            return;
        }
        outputType.value = 'json';

        // 检测非法转义序列
        const illegalCheck = detectIllegalEscapes(value);
        if (illegalCheck.hasIllegal) {
            // 对于包含非法编码的情况，直接拒绝处理
            showMessageError(settingsTxt.value.msgEscapeIllegalRejected);
            return;
        }

        let compressed = '';
        try {
            compressed = jsonEngine.compressInput(value, {
                preserveNumberLiterals: true,
                encodingMode: false,
            }).formatted;
        } catch (error) {
            showMessageError(settingsTxt.value.msgInvalidJson);
            return;
        }

        // 直接用 JSON.stringify 包裹成字符串
        const escapedString = JSON.stringify(compressed);
        setOutputEditorValue(escapedString, 'json', true);

        showMessageSuccess(settingsTxt.value.msgEscapeSuccess);
    } catch (error: any) {
        showMessageError(settingsTxt.value.msgEscapeFail(error.message));
    }
};

// 收缩只改变编辑器折叠状态；已有 JSON 预览时不重新格式化，避免改变简单数组单行等展示结构。
const prepareJsonOutputForFolding = (): string | null => {
    if (!outputEditor) {
        showMessageError(settingsTxt.value.msgEditorNotInit);
        return null;
    }

    const currentOutput = outputEditor.getValue();
    if (outputType.value === 'json' && currentOutput.trim()) {
        updateOutputEditorConfig('json', true);
        return currentOutput;
    }

    const value = inputEditor?.getValue() || '';
    if (!value.trim()) {
        showMessageError(settingsTxt.value.msgInputJsonRequired);
        selectedLevel.value = 1;
        return null;
    }

    let formatted = '';
    try {
        formatted = jsonEngine.formatInput(value).formatted;
    } catch {
        showMessageError(settingsTxt.value.msgInvalidJson);
        return null;
    }

    clearOutputFoldingInfo();
    outputType.value = 'json';
    setOutputEditorValue(formatted, 'json', true);
    return formatted;
};

// 处理层级收缩
const handleLevelAction = () => {
    if (!ensureCollapseFeatureAvailable()) return;
    // 检查是否有正在进行的折叠操作，如果有则直接拒绝新请求
    if (isFoldOperationLocked) {
        showMessageWarning(settingsTxt.value.msgCollapseBusy);
        return;
    }

    try {
        const foldingSourceText = prepareJsonOutputForFolding();
        if (foldingSourceText === null) return;

        const performFold = async () => {
            if (!outputEditor) return;

            isFoldOperationLocked = true;
            try {
                const resolvedMaxFoldableLevel = await resolveMaxFoldableLevel(outputEditor);
                maxFoldableLevel.value = resolvedMaxFoldableLevel;
                if (resolvedMaxFoldableLevel !== null && resolvedMaxFoldableLevel > 0 && selectedLevel.value > resolvedMaxFoldableLevel) {
                    showMessageWarning(settingsTxt.value.msgCollapseMaxLevel(resolvedMaxFoldableLevel));
                    return;
                }

                // 仅当“第一个目标层级区域”不在当前可视区时，自动滚动过去，
                // 避免出现“收缩发生在很靠后位置但视图仍停留在顶部”的体验问题。
                const getVisibleLineRange = (): { start: number; end: number } | null => {
                    try {
                        if (!outputEditor) return null;
                        const visibleRanges = outputEditor.getVisibleRanges();
                        if (!visibleRanges || visibleRanges.length === 0) return null;
                        let minLine = Infinity;
                        let maxLine = 0;
                        visibleRanges.forEach((r) => {
                            minLine = Math.min(minLine, r.startLineNumber);
                            maxLine = Math.max(maxLine, r.endLineNumber);
                        });
                        if (minLine === Infinity || maxLine === 0) return null;
                        return { start: minLine, end: maxLine };
                    } catch {
                        return null;
                    }
                };

                const beforeFoldVisible = getVisibleLineRange();
                const foldResult = await foldByIndentation();
                if (foldResult.targetRegionCount === 0) {
                    const fallbackMaxLevel = maxFoldableLevel.value && maxFoldableLevel.value > 0 ? maxFoldableLevel.value : null;
                    showMessageWarning(settingsTxt.value.msgCollapseNoRegion(selectedLevel.value, fallbackMaxLevel));
                    return;
                }
                showMessageSuccess(settingsTxt.value.msgCollapseSuccess(selectedLevel.value));

                // 折叠完成后，启用折叠信息更新并立即刷新，然后重新计算
                setTimeout(() => {
                    if (!outputEditor) return;
                    try {
                        const revealLine = foldResult.firstTargetLevelLine ?? foldResult.firstCollapsedLine;
                        if (revealLine && beforeFoldVisible) {
                            const line = revealLine;
                            const isOutside = line < beforeFoldVisible.start || line > beforeFoldVisible.end;
                            if (isOutside) {
                                // Monaco 新版本支持 revealLineInCenterIfOutsideViewport，这里做兼容兜底
                                const editorAny = outputEditor as any;
                                if (typeof editorAny.revealLineInCenterIfOutsideViewport === 'function') {
                                    editorAny.revealLineInCenterIfOutsideViewport(line);
                                } else {
                                    outputEditor.revealLineInCenter(line);
                                }
                            }
                        }

                        // 先重新建立折叠范围缓存，再刷新 n keys / n items，避免从非 JSON 输出收缩时无统计信息。
                        if (!shouldPrecomputeFoldingInfo(foldingSourceText.length)) {
                            clearOutputFoldingInfo();
                            return;
                        }

                        precomputeFoldingInfo(foldingSourceText)
                            .then((hasFoldingInfo) => {
                                if (!hasFoldingInfo) return;
                                const refreshFunc = (outputEditor as any).__enableFoldingInfoUpdateAndRefresh;
                                if (refreshFunc) {
                                    refreshFunc();
                                    setTimeout(refreshFunc, 200);
                                }
                            })
                            .catch(() => {});
                    } catch (e) {}
                }, 300); // 等待折叠动画完成
            } finally {
                // 无论成功还是失败，都要释放锁定
                isFoldOperationLocked = false;
            }
        };

        setTimeout(() => {
            performFold();
        }, 100);
    } catch (error: any) {
        showMessageError(settingsTxt.value.msgCollapseFail(error.message));
    }
};

// 打开数据脱敏对话框
const openDataMaskingDialog = () => {
    if (!ensureProcessingFeatureAvailable()) return;
    // 检查输入编辑器是否有内容
    if (!inputEditor) {
        showMessageWarning(settingsTxt.value.msgEditorNotInit);
        return;
    }

    const jsonData = inputEditor.getValue();
    if (!jsonData || !jsonData.trim()) {
        showMessageError(settingsTxt.value.msgInputJsonRequired);
        return;
    }

    // 验证JSON格式
    try {
        JSON.parse(jsonData);
    } catch (error) {
        showMessageError(settingsTxt.value.msgMaskingInvalidJson);
        return;
    }

    dataMaskingDialogVisible.value = true;
};

// 处理数据脱敏应用
const handleDataMaskingApply = (maskedJson: string) => {
    if (!ensureProcessingFeatureAvailable()) return;
    try {
        // 将脱敏后的JSON应用到编辑区域
        if (inputEditor) {
            setInputEditorValue(maskedJson, 'json');

            // 更新层级信息
            try {
                const parsed = JSON.parse(maskedJson);
                maxLevel.value = calculateMaxLevel(parsed);
                if (maxLevel.value > 0 && selectedLevel.value === 0) {
                    selectedLevel.value = getDefaultFoldLevel(maxLevel.value);
                }
            } catch {
                maxLevel.value = 0;
                selectedLevel.value = 0;
            }
        }

        // 清空预览区域
        if (outputEditor) {
            clearOutputFoldingInfo();
            setOutputEditorValue('', 'json', true);
        }

        outputType.value = 'json';
    } catch (error: any) {
        showMessageError(settingsTxt.value.msgMaskingApplyFail(error.message || settingsTxt.value.msgUnknownError));
    }
};

// 获取输入编辑器内容
const getInputEditorValue = (): string => {
    if (!inputEditor) return '';
    return inputEditor.getValue();
};

// ==================== 存档相关逻辑 ====================

// 归一化存档名称：只保留允许字符，并限制为最多 30 个字符

// 找到最小的未使用的数字（用于自动命名）
const findNextAvailableNumber = (): number => {
    // 获取所有已使用的数字
    const usedNumbers = new Set<number>();
    archives.value.forEach((archive) => {
        const name = archive.name.trim();
        // 检查是否是纯数字
        if (/^\d+$/.test(name)) {
            const num = parseInt(name, 10);
            if (!isNaN(num)) {
                usedNumbers.add(num);
            }
        }
    });

    // 从1开始找到第一个未使用的数字
    let nextNum = 1;
    while (usedNumbers.has(nextNum) && nextNum <= MAX_ARCHIVE_COUNT) {
        nextNum++;
    }

    return nextNum;
};

// 处理存档名称确认
const handleArchiveNameConfirm = (name: string) => {
    if (archiveNameDialogCallback.value) {
        archiveNameDialogCallback.value(name);
        archiveNameDialogCallback.value = null;
    }
};

// 处理存档名称取消
const handleArchiveNameCancel = () => {
    archiveNameDialogCallback.value = null;
};

const calculateArchiveSize = (content: string): number => {
    return calculateByteSize(content);
};

const getActiveArchive = (): JsonArchive | null => {
    if (!activeArchiveId.value) return null;
    return archives.value.find((item) => item.id === activeArchiveId.value) || null;
};

const handleSaveArchive = () => {
    if (!ensureProcessingFeatureAvailable()) return;
    if (!inputEditor) {
        showMessageError(settingsTxt.value.msgEditorNotInit);
        return;
    }

    const content = inputEditor.getValue() || '';
    if (!content.trim()) {
        showMessageError(settingsTxt.value.msgArchiveNoContent);
        return;
    }

    // 检查存档数量上限
    if (archives.value.length >= MAX_ARCHIVE_COUNT) {
        showMessageError(settingsTxt.value.msgArchiveCountReached(MAX_ARCHIVE_COUNT));
        return;
    }

    const size = calculateArchiveSize(content);
    if (size > MAX_SINGLE_ARCHIVE_SIZE) {
        showMessageError(settingsTxt.value.msgArchiveTooLarge(Math.round(size / (1024 * 1024))));
        return;
    }

    if (customArchiveName.value) {
        // 使用自定义弹窗
        archiveNameDialogTitle.value = settingsTxt.value.dialogSaveArchive;
        // 使用最小的未使用数字作为默认值
        archiveNameDialogInputValue.value = `${findNextAvailableNumber()}`;
        archiveNameDialogPlaceholder.value = settingsTxt.value.placeholderArchiveName;
        archiveNameDialogExcludeId.value = ''; // 新增时不需要排除
        archiveNameDialogCallback.value = (name: string) => {
            void (async () => {
                // 再次检查存档数量上限（防止在弹窗打开期间存档数量达到上限）
                if (archives.value.length >= MAX_ARCHIVE_COUNT) {
                    showMessageError(settingsTxt.value.msgArchiveCountReached(MAX_ARCHIVE_COUNT));
                    return;
                }

                const normalizedName = normalizeArchiveName(name);
                if (!normalizedName) {
                    showMessageError(settingsTxt.value.msgArchiveNameEmpty);
                    return;
                }

                // 名称重复检查已在弹窗组件内完成，这里不再检查

                const id = `${Date.now()}-${archives.value.length + 1}`;
                const archive: JsonArchive = {
                    id,
                    name: normalizedName,
                    size,
                    content,
                };

                // 新存档放在最前面
                archives.value.unshift(archive);
                activeArchiveId.value = archive.id;
                const saveSuccess = await saveArchives();

                if (saveSuccess) {
                    showMessageSuccess(settingsTxt.value.msgArchiveSavedWithSize(getArchivesTotalSizeInfo()));
                } else {
                    // 保存失败时，从内存数组中移除刚刚添加的存档
                    archives.value.shift();
                    if (activeArchiveId.value === archive.id) {
                        activeArchiveId.value = null;
                    }
                }
            })();
        };
        archiveNameDialogVisible.value = true;
    } else {
        // 自动命名：使用最小的未使用数字
        const nextNum = findNextAvailableNumber();
        let name = normalizeArchiveName(`${nextNum}`);
        if (!name) {
            name = '1';
        }

        const id = `${Date.now()}-${archives.value.length + 1}`;
        const archive: JsonArchive = {
            id,
            name,
            size,
            content,
        };

        // 新存档放在最前面
        archives.value.unshift(archive);
        activeArchiveId.value = archive.id;
        void (async () => {
            const saveSuccess = await saveArchives();
            if (saveSuccess) {
                showMessageSuccess(settingsTxt.value.msgArchiveSavedWithSize(getArchivesTotalSizeInfo()));
            } else {
                // 保存失败时，从内存数组中移除刚刚添加的存档
                archives.value.shift();
                if (activeArchiveId.value === archive.id) {
                    activeArchiveId.value = null;
                }
            }
        })();
    }
};

const handleArchiveCommand = async (command: string) => {
    dragEnabledArchiveId.value = null;
    const archive = archives.value.find((item) => item.id === command);
    if (!archive) {
        showMessageError(settingsTxt.value.msgArchiveNotFound);
        return;
    }

    if (!inputEditor) {
        showMessageError(settingsTxt.value.msgEditorNotInit);
        return;
    }

    // 直接加载存档内容，保持原有格式（不重新格式化以避免缩进不一致）
    setInputEditorValue(archive.content, 'json');

    // 检测存档内容的缩进设置，并更新编辑器以匹配
    const detectIndentSize = (text: string): { size: number; insertSpaces: boolean } => {
        const lines = text.split('\n');
        for (const line of lines) {
            const match = line.match(/^[ \t]+(?=\S)/);
            if (match) {
                const indentStr = match[0];
                if (indentStr.includes('\t')) {
                    return { size: 4, insertSpaces: false }; // Tab键缩进
                }
                return { size: indentStr.length || 2, insertSpaces: true }; // 空格缩进
            }
        }
        return { size: 2, insertSpaces: true }; // 默认2格空格
    };

    const detectedIndent = detectIndentSize(archive.content);
    const model = inputEditor.getModel();
    if (model) {
        updateModelDisplayOptions(model, detectedIndent.size, detectedIndent.insertSpaces);
    }
    updateEditorDisplayIndentOptions(inputEditor, detectedIndent.size);

    // 清空outputEditor的内容
    if (outputEditor) {
        clearOutputFoldingInfo();
        setOutputEditorValue('', 'json', true);
    }

    // 重置层级选择状态
    selectedLevel.value = 0;

    // 更新层级信息
    try {
        const parsed = JSON.parse(archive.content);
        maxLevel.value = calculateMaxLevel(parsed);
        selectedLevel.value = getDefaultFoldLevel(maxLevel.value);
    } catch (e) {
        // 解析失败，重置为0
        maxLevel.value = 0;
    }

    activeArchiveId.value = archive.id;
    showMessageSuccess(settingsTxt.value.msgArchiveLoaded(archive.name));
};

const handleRenameActiveArchive = () => {
    const archive = getActiveArchive();
    if (!archive) return;
    handleRenameArchive(archive);
};

const handleRefreshActiveArchive = async () => {
    const archive = getActiveArchive();
    if (!archive) return;
    await handleRefreshArchive(archive);
};

const handleDeleteActiveArchive = async () => {
    const archive = getActiveArchive();
    if (!archive) return;
    await handleDeleteArchive(archive);
};

// 更新存档内容（将当前编辑区域的内容保存到指定存档）
const handleRefreshArchive = async (item: JsonArchive) => {
    if (!inputEditor) {
        showMessageError(settingsTxt.value.msgEditorNotInit);
        return;
    }

    const newContent = inputEditor.getValue() || '';
    if (!newContent.trim()) {
        showMessageError(settingsTxt.value.msgArchiveRefreshNoContent);
        return;
    }

    const newSize = calculateArchiveSize(newContent);
    if (newSize > MAX_SINGLE_ARCHIVE_SIZE) {
        showMessageError(settingsTxt.value.msgArchiveRefreshTooLarge(Math.round(newSize / (1024 * 1024))));
        return;
    }

    try {
        // 更新存档内容
        const index = archives.value.findIndex((a) => a.id === item.id);
        if (index !== -1) {
            // 保存旧的存档数据，用于回滚
            const oldContent = archives.value[index].content;
            const oldSize = archives.value[index].size;

            archives.value[index].content = newContent;
            archives.value[index].size = newSize;

            const saveSuccess = await saveArchives();
            if (saveSuccess) {
                showMessageSuccess(settingsTxt.value.msgArchiveRefreshSuccess(getArchivesTotalSizeInfo()));
            } else {
                // 保存失败时，回滚内存中的更改
                const currentIndex = archives.value.findIndex((a) => a.id === item.id);
                if (currentIndex !== -1) {
                    archives.value[currentIndex].content = oldContent;
                    archives.value[currentIndex].size = oldSize;
                }
            }
        } else {
            showMessageError(settingsTxt.value.msgArchiveNotFound);
        }
    } catch (error: any) {
        showMessageError(settingsTxt.value.msgArchiveUpdateFail(error.message));
    }
};

// 删除单个存档
const handleDeleteArchive = async (item: JsonArchive) => {
    try {
        await ElMessageBox.confirm(settingsTxt.value.confirmDeleteArchiveContent(item.name), settingsTxt.value.confirmDeleteArchiveTitle, {
            confirmButtonText: settingsTxt.value.confirmDeleteArchiveBtn,
            cancelButtonText: settingsTxt.value.confirmDeleteArchiveCancelBtn,
            customClass: 'delete-archive-message-box',
            dangerouslyUseHTMLString: false,
        });
    } catch {
        // 用户取消
        return;
    }

    const index = archives.value.findIndex((a) => a.id === item.id);
    if (index !== -1) {
        const deletedArchive = archives.value.splice(index, 1)[0];
        const saveSuccess = await saveArchives();
        if (saveSuccess) {
            if (activeArchiveId.value === item.id) {
                activeArchiveId.value = null;
            }
            showMessageSuccess(settingsTxt.value.msgArchiveDeletedWithSize(getArchivesTotalSizeInfo()));
        } else {
            // 保存失败时，将删除的存档重新添加回去
            archives.value.splice(index, 0, deletedArchive);
        }
    }
};

// 重命名单个存档
const handleRenameArchive = (item: JsonArchive) => {
    archiveNameDialogTitle.value = settingsTxt.value.dialogRenameArchive;
    archiveNameDialogInputValue.value = item.name;
    archiveNameDialogPlaceholder.value = settingsTxt.value.placeholderArchiveName;
    archiveNameDialogExcludeId.value = item.id; // 编辑时排除当前存档
    archiveNameDialogCallback.value = (name: string) => {
        void (async () => {
            const normalizedName = normalizeArchiveName(name);
            if (!normalizedName) {
                showMessageError(settingsTxt.value.msgArchiveNameEmpty);
                return;
            }

            // 名称重复检查已在弹窗组件内完成，这里不再检查

            const oldName = item.name;
            item.name = normalizedName;
            const saveSuccess = await saveArchives();
            if (saveSuccess) {
                showMessageSuccess(settingsTxt.value.msgArchiveRenameSuccess);
            } else {
                // 保存失败时，回滚名称更改
                item.name = oldName;
            }
        })();
    };
    archiveNameDialogVisible.value = true;
};

// 处理转义相关命令
const handleEscapeCommand = (command: string) => {
    if (!ensureProcessingFeatureAvailable()) return;
    switch (command) {
        case 'unescape':
            unescapeJSON(recursiveUnescape.value);
            break;
    }
};

// 处理高级功能命令
const handleAdvancedCommand = async (command: string) => {
    if (command === 'sort' && !ensureProcessingFeatureAvailable()) return;
    if (command === 'collapse' && !ensureCollapseFeatureAvailable()) return;
    switch (command) {
        case 'sort':
            await applySort();
            break;
        case 'collapse':
            if (maxLevel.value > 0) {
                handleLevelAction();
            }
            break;
    }
};

const resetInputDragState = () => {
    inputDragEnterDepth.value = 0;
    isInputDragActive.value = false;
};

const isFileDragEvent = (event: DragEvent): boolean => {
    const types = event.dataTransfer?.types;
    if (!types) return false;
    return Array.from(types).includes('Files');
};

const processInputFileUpload = async (file: File | null | undefined) => {
    if (!file) {
        showMessageError(settingsTxt.value.msgFileGetFail);
        return;
    }

    try {
        // 检查文件名长度
        if (file.name.length > 255) {
            showMessageError(settingsTxt.value.msgFileNameTooLong);
            return;
        }

        // 检查文件扩展名
        if (!file.name.toLowerCase().endsWith('.json')) {
            showMessageError(settingsTxt.value.msgFileOnlyJson);
            return;
        }

        // 检查文件大小
        if (file.size > MAX_FILE_SIZE) {
            showMessageError(settingsTxt.value.msgFileTooLarge);
            return;
        }

        // 检查 MIME 类型
        if (file.type && !['application/json', 'text/plain'].includes(file.type)) {
            showMessageError(settingsTxt.value.msgFileWrongType);
            return;
        }

        // 读取文件内容
        const content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (e.target?.result) {
                    // 直接使用读取的文本，不再检查替换字符
                    // 因为某些二进制数据可能被序列化为 \uFFFD，但这不影响 JSON 处理
                    resolve(e.target.result as string);
                } else {
                    reject(new Error(settingsTxt.value.msgFileReadFail));
                }
            };
            reader.onerror = () => reject(new Error(settingsTxt.value.msgFileReadError));
            reader.readAsText(file, 'utf-8');
        });

        // 格式化JSON内容为2个空格缩进
        let formattedContent = content;

        // 更新编辑器 - 将格式化后的内容展示到编辑区域
        if (inputEditor) {
            setInputEditorValue(formattedContent, 'json');
        }

        // 清空outputEditor的内容
        if (outputEditor) {
            clearOutputFoldingInfo();
            setOutputEditorValue('', 'json', true);
        }

        showMessageSuccess(settingsTxt.value.msgFileUploadSuccessLoaded);
    } catch (error: any) {
        showMessageError(settingsTxt.value.msgFileProcessFail(error.message));
    }
};

// 文件上传
const handleFileUpload = async (uploadFile: UploadFile) => {
    const file = uploadFile.raw as File;
    await processInputFileUpload(file);
};

const handleInputDragEnter = (event: DragEvent) => {
    if (!isFileDragEvent(event)) return;
    inputDragEnterDepth.value += 1;
    isInputDragActive.value = true;
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
    }
};

const handleInputDragOver = (event: DragEvent) => {
    if (!isFileDragEvent(event)) return;
    isInputDragActive.value = true;
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
    }
};

const handleInputDragLeave = (event: DragEvent) => {
    if (!isFileDragEvent(event)) return;
    const currentTarget = event.currentTarget as HTMLElement | null;
    const relatedTarget = event.relatedTarget as Node | null;
    if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
        return;
    }
    inputDragEnterDepth.value = Math.max(0, inputDragEnterDepth.value - 1);
    if (inputDragEnterDepth.value === 0) {
        isInputDragActive.value = false;
    }
};

const handleInputFileDrop = async (event: DragEvent) => {
    if (!isFileDragEvent(event)) return;
    const files = event.dataTransfer?.files;
    resetInputDragState();
    if (!files || files.length === 0) {
        showMessageError(settingsTxt.value.msgFileGetFail);
        return;
    }
    await processInputFileUpload(files[0] ?? null);
};

// 清空输入
const clearInput = (showToast: boolean = true) => {
    try {
        maxLevel.value = 0;
        selectedLevel.value = 0;

        if (inputEditor) {
            const model = inputEditor.getModel();
            if (model) {
                const fullRange = model.getFullModelRange();
                if (!fullRange.isEmpty()) {
                    inputEditor.executeEdits('clear-input', [
                        {
                            range: fullRange,
                            text: '',
                        },
                    ]);
                }

                // 延迟后再设置回JSON语言
                setTimeout(() => {
                    if (model && !model.isDisposed()) {
                        updateInputEditorConfig('json');
                    }
                }, 100);
            }
        }

        if (outputEditor) {
            clearOutputFoldingInfo();
            const model = outputEditor.getModel();
            if (model) {
                const fullRange = model.getFullModelRange();
                if (!fullRange.isEmpty()) {
                    outputEditor.executeEdits('clear-output', [
                        {
                            range: fullRange,
                            text: '',
                        },
                    ]);
                }
            }
            updateEditorHeight(outputEditor);
        }

        outputType.value = 'json';
        if (showToast) {
            showMessageSuccess(settingsTxt.value.msgClearedContent);
        }
    } catch (error: any) {
        showMessageError(settingsTxt.value.msgClearFail);
    }
};

// 复制输出
const copyOutput = async () => {
    try {
        const value = outputEditor?.getValue() || '';
        if (!value) {
            showMessageWarning(settingsTxt.value.msgNoCopyContent);
            return;
        }

        try {
            await navigator.clipboard.writeText(value);
            showMessageSuccess(settingsTxt.value.msgCopySuccess);
        } catch (err) {
            showMessageError(settingsTxt.value.msgCopyFailManual);

            // 自动选择内容以方便用户复制
            outputEditor?.focus();
            outputEditor?.getModel()?.getFullModelRange();
            outputEditor?.setSelection(outputEditor.getModel()?.getFullModelRange() || new monaco.Range(0, 0, 0, 0));
        }
    } catch (error: any) {
        showMessageError(settingsTxt.value.msgCopyFailManual);
    }
};

// 计算字符串的 SHA-256 哈希值

// 下载内容
const downloadOutput = async () => {
    const content = outputEditor?.getValue();
    if (!content) {
        showMessageWarning('没有可下载的内容');
        return;
    }

    try {
        // 计算内容的哈希值，使用前32个字符（128位，冲突概率极低）
        const fullHash = await calculateHash(content);
        const hash = fullHash.substring(0, 32);

        // 根据输出类型决定文件扩展名和 MIME 类型
        const fileExtensionMap: Record<'json' | 'yaml' | 'toml' | 'xml' | 'go' | 'typescript' | 'text', string> = {
            json: '.json',
            yaml: '.yaml',
            toml: '.toml',
            xml: '.xml',
            go: '.go',
            typescript: '.ts',
            text: '.txt',
        };
        const fileExtension = fileExtensionMap[outputType.value];

        const mimeTypeMap: Record<'json' | 'yaml' | 'toml' | 'xml' | 'go' | 'typescript' | 'text', string> = {
            json: 'application/json',
            yaml: 'text/yaml',
            toml: 'text/plain',
            xml: 'application/xml',
            go: 'text/plain',
            typescript: 'text/typescript',
            text: 'text/plain',
        };
        const mimeType = mimeTypeMap[outputType.value];

        // 创建 Blob 对象
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);

        // 创建下载链接
        const link = document.createElement('a');
        link.href = url;
        // 生成文件名：哈希值（32字符）.扩展名
        link.download = `${hash}${fileExtension}`;
        document.body.appendChild(link);
        link.click();

        // 清理
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showMessageSuccess(settingsTxt.value.msgDownloadSuccess);
    } catch (error: any) {
        showMessageError(settingsTxt.value.msgDownloadFailWithErr(error?.message || settingsTxt.value.msgUnknownError));
    }
};

// 拖动时也要更新预览区域布局，让滚动条紧贴右边界，但需要恢复滚动内容位置
const updateEditorLayouts = (updateOutputEditor: boolean = true, forceWidth?: { inputWidth?: number; outputWidth?: number }) => {
    // 如果没有传入强制宽度，使用面板的实际宽度，避免受到存档侧边栏宽度的影响
    let inputWidth = forceWidth?.inputWidth;
    let outputWidth = forceWidth?.outputWidth;

    if (inputWidth === undefined || outputWidth === undefined) {
        const panels = getMainEditorContainer()?.querySelectorAll('.editor-panel') as NodeListOf<HTMLElement> | undefined;
        if (panels && panels.length >= 2) {
            const [leftPanel, rightPanel] = panels;
            inputWidth = inputWidth ?? leftPanel.clientWidth;
            outputWidth = outputWidth ?? rightPanel.clientWidth;
        }
    }

    if (inputEditor && isUsableLayoutSize(inputWidth)) {
        const container = inputEditor.getContainerDomNode();
        if (isUsableLayoutSize(container.clientHeight)) {
            inputEditor.layout({
                width: inputWidth,
                height: container.clientHeight,
            });
        }
    }
    if (outputEditor && updateOutputEditor && isUsableLayoutSize(outputWidth)) {
        const container = outputEditor.getContainerDomNode();
        if (isUsableLayoutSize(container.clientHeight)) {
            outputEditor.layout({
                width: outputWidth,
                height: container.clientHeight,
            });
        }
    }
};

// 获取事件中的 clientX（统一处理不同事件类型）
const getClientX = (e: MouseEvent | TouchEvent | PointerEvent): number | null => {
    if ('touches' in e && e.touches.length > 0) {
        return e.touches[0].clientX;
    } else if ('clientX' in e) {
        return e.clientX;
    }
    return null;
};

// 处理指针移动（提升到外层作用域，避免每次拖动创建新函数）
const handlePointerMove = (moveEvent: MouseEvent | TouchEvent | PointerEvent) => {
    if (!isResizing.value || !resizeState) return;

    if (typeof PointerEvent !== 'undefined' && moveEvent instanceof PointerEvent && resizeState.pointerId !== null && moveEvent.pointerId !== resizeState.pointerId) {
        return;
    }

    if (moveEvent.cancelable) {
        moveEvent.preventDefault();
    }

    const clientX = getClientX(moveEvent);
    if (clientX === null) return;

    // 实时更新容器尺寸（来回拖动时容器可能变化）
    if (!resizeState.container.isConnected) {
        stopResize();
        return;
    }

    const currentRect = resizeState.container.getBoundingClientRect();
    if (!isUsableLayoutSize(currentRect.width)) {
        return;
    }
    resizeState.rect = currentRect;
    resizeState.minWidthPercent = (resizeState.minWidthPx / currentRect.width) * 100;
    resizeState.maxWidthPercent = 100 - resizeState.minWidthPercent;

    // 立即计算新宽度（不使用 rAF 节流，确保极快拖动时也能实时响应）
    const clampedX = Math.max(resizeState.rect.left + resizeState.minWidthPx, Math.min(clientX, resizeState.rect.right - resizeState.minWidthPx));

    // 计算新的百分比宽度
    const deltaX = clampedX - resizeState.initialX;
    const deltaPercentage = (deltaX / resizeState.rect.width) * 100;
    const newWidth = Math.min(Math.max(resizeState.initialPercentage + deltaPercentage, resizeState.minWidthPercent), resizeState.maxWidthPercent);
    if (!Number.isFinite(newWidth)) {
        return;
    }

    // 立即更新宽度值（不检查阈值，确保每次移动都响应）
    leftPanelWidth.value = newWidth;

    // 触发防抖更新稳定宽度值
    updateStableWidth();

    // 这样可以确保 Monaco Editor 接收到准确的宽度，从而正确计算滚动条位置
    const containerWidth = resizeState.rect.width;
    const archiveWidth = archives.value.length ? archiveSidebarWidth.value : 0;
    const archiveResizerWidth = archives.value.length ? 3 : 0;
    const resizerWidth = 24; // 中间分割线宽度（固定值）
    const availableWidth = containerWidth - archiveWidth - archiveResizerWidth - resizerWidth;
    if (!isUsableLayoutSize(availableWidth)) {
        return;
    }

    // 计算面板的实际宽度（考虑存档侧边栏和分割线）
    const inputWidth = Math.round((newWidth / 100) * availableWidth);
    const outputWidth = Math.round(((100 - newWidth) / 100) * availableWidth);

    // 使用计算出的宽度强制更新布局，确保滚动条实时紧贴边界
    updateEditorLayouts(true, { inputWidth, outputWidth });
};

// 停止拖动（提升到外层作用域）
const stopResize = () => {
    if (!isResizing.value) return;

    isResizing.value = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';

    // 恢复 CSS transition（拖动结束后恢复平滑动画）
    if (resizeState && resizeState.container) {
        const panels = resizeState.container.querySelectorAll('.editor-panel');
        panels.forEach((panel: Element) => {
            (panel as HTMLElement).style.transition = '';
        });
    }

    // 清除防抖定时器，立即同步稳定宽度值
    if (stableWidthUpdateTimer) {
        clearTimeout(stableWidthUpdateTimer);
        stableWidthUpdateTimer = null;
    }
    stableLeftPanelWidth.value = leftPanelWidth.value;

    // 释放指针捕获
    if (resizeState?.pointerCaptureElement && resizeState.pointerId !== null) {
        try {
            resizeState.pointerCaptureElement.releasePointerCapture(resizeState.pointerId);
        } catch (err) {
            // 忽略错误
        }
    }

    // 移除事件监听（只使用 pointer 事件，现代浏览器已足够）
    window.removeEventListener('pointermove', handlePointerMove as EventListener);
    window.removeEventListener('pointerup', stopResize as EventListener);
    window.removeEventListener('pointercancel', stopResize as EventListener);
    window.removeEventListener('blur', stopResize as EventListener);

    // 保存滚动位置（在布局更新前保存，因为布局更新可能会改变滚动位置）
    const savedScrollLeft = resizeState?.outputScrollLeft || 0;
    const savedScrollTop = resizeState?.outputScrollTop || 0;

    // 立即执行一次布局更新，确保最终状态正确（不再执行1000次！）
    // 拖动结束后，同时更新两个编辑器的布局，确保最终状态正确
    nextTick(() => {
        updateEditorLayouts(true);

        // 布局更新后，恢复之前保存的滚动位置（确保预览区域的滚动条位置不变）
        if (outputEditor) {
            // 使用 requestAnimationFrame 确保在布局完全更新后再恢复滚动位置
            requestAnimationFrame(() => {
                if (outputEditor) {
                    // 通过 Monaco Editor 的滚动容器 DOM 元素恢复滚动位置
                    const scrollableElement = outputEditor.getContainerDomNode().querySelector('.monaco-scrollable-element') as HTMLElement;
                    if (scrollableElement) {
                        // 总是恢复滚动位置，即使为 0 也可能是有效的顶部位置
                        scrollableElement.scrollLeft = savedScrollLeft;
                        scrollableElement.scrollTop = savedScrollTop;
                    }
                }
            });
        }
    });

    // 清理状态
    resizeState = null;
};

// 分割线拖动实现
const startResize = (e: PointerEvent) => {
    // 演示模式下锁定分割线，防止 Popover 锚点抖动导致引导卡片位置乱跳
    if (isDemoMode.value) {
        e.preventDefault();
        return;
    }

    // 获取初始位置
    const initialX = getClientX(e);
    if (initialX === null) return;

    const editorContainer = getResizeContainerFromEvent(e);
    if (!editorContainer) return;

    // 获取容器尺寸。旧 DOM、diff/普通模式切换后的脱离 DOM、或隐藏状态都不能进入拖拽流程。
    const rect = editorContainer.getBoundingClientRect();
    if (!isUsableLayoutSize(rect.width)) return;

    e.preventDefault();
    e.stopPropagation();

    // 捕获指针，避免拖过 Monaco 编辑器时被编辑器内部 selection/drag 逻辑抢走事件。
    const pointerCaptureElement = e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
    if (pointerCaptureElement) {
        try {
            pointerCaptureElement.setPointerCapture(e.pointerId);
        } catch (err) {
            // 忽略错误
        }
    }

    isResizing.value = true;

    // 清除之前的防抖定时器，立即同步稳定宽度值
    if (stableWidthUpdateTimer) {
        clearTimeout(stableWidthUpdateTimer);
        stableWidthUpdateTimer = null;
    }
    stableLeftPanelWidth.value = leftPanelWidth.value;

    // 禁用选择和默认事件
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    // 禁用 CSS transition，避免拖动时的动画延迟（确保实时响应）
    const panels = editorContainer.querySelectorAll('.editor-panel');
    panels.forEach((panel: Element) => {
        (panel as HTMLElement).style.transition = 'none';
    });

    editorContainerWidth.value = rect.width;

    // 计算最小/最大宽度限制（允许折叠到0）
    const minWidthPx = 0;
    const minWidthPercent = (minWidthPx / rect.width) * 100;
    const maxWidthPercent = 100 - minWidthPercent;

    // 获取预览区域容器并保存初始状态（用于恢复滚动内容位置）
    const outputPanel = editorContainer.querySelector('.output-panel') as HTMLElement;
    let outputScrollLeft = 0;
    let outputScrollTop = 0;

    if (outputPanel && outputEditor) {
        const scrollableElement = outputEditor.getContainerDomNode().querySelector('.monaco-scrollable-element') as HTMLElement;
        if (scrollableElement) {
            outputScrollLeft = scrollableElement.scrollLeft;
            outputScrollTop = scrollableElement.scrollTop;
        }
    }

    // 保存拖动状态
    resizeState = {
        initialX,
        initialPercentage: leftPanelWidth.value,
        container: editorContainer,
        rect: rect,
        minWidthPercent,
        maxWidthPercent,
        minWidthPx,
        pointerId: e.pointerId,
        pointerCaptureElement,
        // 预览区域滚动位置（用于在拖动过程中保持滚动内容位置不变）
        outputScrollLeft,
        outputScrollTop,
    };

    // 添加事件监听（只使用 pointer 事件，已覆盖鼠标和触摸）
    window.addEventListener('pointermove', handlePointerMove as EventListener, {
        passive: false,
    });
    window.addEventListener('pointerup', stopResize as EventListener);
    window.addEventListener('pointercancel', stopResize as EventListener);
    window.addEventListener('blur', stopResize as EventListener);
};

// 添加将预览区域内容转移到编辑区域的方法
const transferToInput = (e: MouseEvent) => {
    // 阻止事件冒泡，防止触发分割线的拖动
    e.stopPropagation();

    try {
        const outputContent = outputEditor?.getValue() || '';
        if (!outputContent.trim()) {
            showMessageWarning(settingsTxt.value.msgTransferOutputEmpty);
            return;
        }

        // 保存预览区域的视图状态（包含折叠状态、滚动位置等）
        const viewState = outputEditor?.saveViewState();

        const targetIndentSize = indentSize.value; // 使用用户设置的缩进大小
        const shouldReformatOnTransfer = outputType.value === 'json';
        let formattedContent = outputContent;
        let targetInputLanguage: EditorContentLanguage = 'json';

        if (shouldReformatOnTransfer) {
            try {
                // 直接重新格式化缩进，保持原始字符串表示不变
                formattedContent = reformatJsonIndentation(outputContent, targetIndentSize);
            } catch (parseError) {
                // 如果解析失败，使用原始内容
                formattedContent = outputContent;
            }
        } else if (outputType.value === 'text') {
            targetInputLanguage = detectInputLanguage(outputContent);
        }

        // 转移内容到编辑区域
        if (inputEditor) {
            setInputEditorValue(formattedContent, targetInputLanguage);
            syncEditorDisplayOptions(inputEditor, targetInputLanguage, targetIndentSize, formattedContent);

            // 恢复视图状态（折叠状态、滚动位置等）
            if (viewState) {
                // 使用 nextTick 确保内容更新后再恢复状态
                nextTick(() => {
                    // 先强制展开所有折叠，确保与预览区域状态一致（特别是预览区域全展开的情况）
                    // 使用 run() 方法确保执行完成
                    const unfoldAction = inputEditor?.getAction('editor.unfoldAll');
                    if (unfoldAction) {
                        unfoldAction.run().then(() => {
                            // 展开完成后，再恢复预览区域的视图状态（如果有折叠，会再次应用）
                            inputEditor?.restoreViewState(viewState);
                            refreshEditorStatus(inputEditor, inputEditorStatus);
                        });
                    } else {
                        // 如果找不到 unfoldAll 动作，直接恢复
                        inputEditor?.restoreViewState(viewState);
                        refreshEditorStatus(inputEditor, inputEditorStatus);
                    }
                });
            }
        }

        // 清空预览区域
        if (outputEditor) {
            clearOutputFoldingInfo();
            setOutputEditorValue('', 'json', true);
        }

        showMessageSuccess(settingsTxt.value.msgTransferSuccess);
    } catch (error: any) {
        showMessageError(settingsTxt.value.msgTransferFail(error.message));
    }
};
</script>

<style scoped>
/* 折叠信息文本样式 */
:deep(.folding-info-text) {
    color: #909399;
}

.json-tool-root {
    height: 100%;
    --json-tool-bg: #f0f2f5;
    --json-tool-surface: #ffffff;
    --json-tool-surface-soft: #f5f7fa;
    --json-tool-surface-header: linear-gradient(to bottom, #fafbfc, #f6f8fa);
    --json-tool-surface-status: linear-gradient(to bottom, #fafbfc, #f5f7fa);
    --json-tool-border: #e4e7ed;
    --json-tool-toolbar-border: rgba(160, 170, 180, 0.18);
    --json-tool-text: #303133;
    --json-tool-text-muted: #606266;
    --json-tool-editor-bg: #ffffff;
    --json-tool-current-line: rgba(103, 194, 58, 0.08);
    --json-tool-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
    --json-tool-archive-hover: #f7faff;
    --json-tool-archive-active: var(--el-color-primary-light-9, #ecf5ff);
    --json-tool-archive-active-hover: var(--el-color-primary-light-8, #d9ecff);
    --json-tool-archive-drag: #eef5ff;
    --json-tool-archive-scrollbar: rgba(144, 147, 153, 0.42);
    --json-tool-archive-scrollbar-hover: rgba(96, 98, 102, 0.58);
    --json-tool-button-bg: #ffffff;
    --json-tool-button-border: #dcdfe6;
    --json-tool-button-text: #606266;
    --json-tool-button-hover-bg: #f4f4f5;
    --json-tool-button-hover-border: #c8c9cc;
    --json-tool-diff-nav-bg: rgba(244, 246, 248, 0.94);
    --json-tool-diff-nav-border: rgba(205, 212, 220, 0.92);
    --json-tool-diff-nav-divider: rgba(205, 212, 220, 0.92);
    --json-tool-diff-nav-text: #4f5663;
    --json-tool-diff-nav-status-bg: rgba(232, 237, 242, 0.96);
    --json-tool-diff-nav-action-hover: rgba(234, 238, 243, 0.96);
    --json-tool-diff-nav-action-active: rgba(224, 229, 236, 0.98);
    --json-tool-diff-nav-action-disabled: rgba(159, 167, 178, 0.58);
    --json-tool-theme-transition: background-color 120ms ease, color 100ms ease, border-color 120ms ease;
    color: var(--json-tool-text);
    transition: var(--json-tool-theme-transition);
}

.json-tool-root.theme-dark {
    --json-tool-bg: #181818;
    --json-tool-surface: #1f1f1f;
    --json-tool-surface-soft: #181818;
    --json-tool-surface-header: linear-gradient(to bottom, #232323, #1f1f1f);
    --json-tool-surface-status: linear-gradient(to bottom, #1f1f1f, #181818);
    --json-tool-border: #2b2b2b;
    --json-tool-toolbar-border: rgba(204, 204, 204, 0.12);
    --json-tool-text: #cccccc;
    --json-tool-text-muted: #9da0a6;
    --json-tool-editor-bg: #1e1e1e;
    --json-tool-current-line: rgba(90, 97, 114, 0.34);
    --json-tool-shadow: 0 2px 18px rgba(0, 0, 0, 0.32);
    --json-tool-archive-hover: rgba(255, 255, 255, 0.06);
    --json-tool-archive-active: rgba(64, 158, 255, 0.16);
    --json-tool-archive-active-hover: rgba(64, 158, 255, 0.22);
    --json-tool-archive-drag: rgba(255, 255, 255, 0.08);
    --json-tool-archive-scrollbar: rgba(121, 121, 121, 0.45);
    --json-tool-archive-scrollbar-hover: rgba(166, 166, 166, 0.62);
    --json-tool-button-bg: #2a2a2a;
    --json-tool-button-border: #3a3a3a;
    --json-tool-button-text: #d4d4d4;
    --json-tool-button-hover-bg: #333333;
    --json-tool-button-hover-border: #4a4a4a;
    --json-tool-diff-nav-bg: rgba(40, 40, 40, 0.94);
    --json-tool-diff-nav-border: rgba(72, 72, 72, 0.96);
    --json-tool-diff-nav-divider: rgba(78, 78, 78, 0.96);
    --json-tool-diff-nav-text: #b2b6bd;
    --json-tool-diff-nav-status-bg: rgba(52, 52, 52, 0.98);
    --json-tool-diff-nav-action-hover: rgba(55, 55, 55, 0.98);
    --json-tool-diff-nav-action-active: rgba(64, 64, 64, 1);
    --json-tool-diff-nav-action-disabled: rgba(120, 120, 120, 0.62);
}

.json-tool-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: var(--json-tool-bg);
    transition:
        background-color 120ms ease,
        border-color 120ms ease;
}

/* 添加小屏幕提示样式 */
.screen-size-warning {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #f5f7fa;
    z-index: 2000;
    padding: 20px;
    text-align: center;
    align-items: center;
    justify-content: center;
    flex-direction: column;
}

.warning-icon {
    font-size: 48px;
    color: #e6a23c;
    margin-bottom: 20px;
}

.warning-text {
    font-size: 16px;
    color: #606266;
    line-height: 1.6;
    max-width: 80%;
    margin: 0 auto;
}

@media screen and (max-width: 900px) {
    .json-tool-container {
        display: none;
    }

    .screen-size-warning {
        display: flex;
    }
}

/* 工具栏包装器 */
.tool-bar-wrapper {
    position: relative;
    display: flex;
    align-items: center;
}

.tool-bar {
    border-bottom: 1px solid var(--json-tool-toolbar-border);
    box-shadow: 0 2px 6px rgba(16, 24, 40, 0.03);
    padding: 5px 10px;
    display: flex;
    align-items: center;
    gap: 0;
    flex-wrap: nowrap;
    flex-shrink: 0;
    overflow-x: auto;
    overflow-y: hidden;
    background-color: var(--json-tool-surface);
    position: relative;
    flex: 1;
    scroll-behavior: smooth;
    scrollbar-width: none;
    transition: var(--json-tool-theme-transition);
    /* Firefox 隐藏滚动条 */
    -ms-overflow-style: none;
    /* IE/Edge 隐藏滚动条 */
}

/* 工具栏滚动条隐藏 */
.tool-bar::-webkit-scrollbar {
    display: none;
    /* Chrome/Safari 隐藏滚动条 */
}

/* 滚动指示器 */
.scroll-indicator {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 10;
    display: flex;
    align-items: center;
    pointer-events: none;
    height: 100%;
}

.scroll-indicator-left {
    left: 0;
    padding-left: 4px;
}

.scroll-indicator-right {
    right: 0;
    padding-right: 4px;
}

/* 滚动按钮 */
.scroll-btn {
    pointer-events: auto;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    transition: all 0.2s ease;
    z-index: 11;
    position: relative;
}

.scroll-btn:hover {
    transform: scale(1.1);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.scroll-btn:active {
    transform: scale(0.95);
}

/* 渐变遮罩 */
.gradient-mask {
    width: 50px;
    height: 100%;
    pointer-events: none;
    position: absolute;
    top: 0;
    z-index: 9;
}

.gradient-mask-left {
    left: 0;
    background: linear-gradient(to right, var(--json-tool-surface) 0%, color-mix(in srgb, var(--json-tool-surface) 85%, transparent) 40%, transparent 100%);
}

.gradient-mask-right {
    right: 0;
    background: linear-gradient(to left, var(--json-tool-surface) 0%, color-mix(in srgb, var(--json-tool-surface) 85%, transparent) 40%, transparent 100%);
}

/* 按钮组之间紧挨着，但单个按钮和按钮组之间要有间距 */
.tool-bar > .el-button,
.tool-bar > .el-button-group,
.tool-bar > .el-dropdown,
.tool-bar > .collapse-control {
    margin-left: 10px;
    flex-shrink: 0;
    white-space: nowrap;
}

.tool-bar > .el-button:first-child,
.tool-bar > .el-button-group:first-child,
.tool-bar > .el-dropdown:first-child,
.tool-bar > .collapse-control:first-child {
    margin-left: 0;
}

.settings-tool-button {
    width: 32px;
    padding: 8px !important;
    border-radius: 4px !important;
}

.tool-bar :deep(.el-button:not(.settings-tool-button)) {
    padding: 6px 12px !important;
}

.main-action-group > .data-convert-dropdown {
    float: left;
    position: relative;
}

.main-action-group > .data-convert-dropdown:first-child :deep(.el-button) {
    border-radius: var(--el-border-radius-base) !important;
}

.main-action-group > .data-convert-dropdown:not(:first-child) :deep(.el-button) {
    border-left-color: var(--el-button-divide-border-color) !important;
    border-top-left-radius: 0 !important;
    border-bottom-left-radius: 0 !important;
}

/* 层级控制优化 */
.collapse-control {
    display: flex;
    align-items: center;
    gap: 0;
}

.collapse-control .level-select {
    width: 84px;
    --json-tool-level-select-border: var(--el-color-success, #67c23a);
    --json-tool-level-select-hover-border: var(--el-color-success-dark-2, #529b2e);
    --json-tool-level-select-disabled-border: var(--el-color-success-light-5, #b3e19d);
}

.collapse-control .level-select.level-select-en {
    width: 98px;
}

.json-tool-root.theme-dark .collapse-control .level-select {
    --json-tool-level-select-border: #327a4c;
    --json-tool-level-select-hover-border: #409a61;
}

.collapse-control .level-action-button {
    margin-left: -1px !important;
    border-radius: 0 4px 4px 0 !important;
    position: relative;
}

.collapse-control .level-action-button:hover,
.collapse-control .level-action-button:focus {
    z-index: 1;
}

:deep(.el-select-dropdown__item) {
    padding: 0 20px !important;
}

:global(.level-select-dropdown) {
    min-width: 84px !important;
}

:global(.level-select-dropdown.level-select-dropdown-en) {
    min-width: 98px !important;
}

:global(.level-select-dropdown .el-select-dropdown__wrap),
:global(.level-select-dropdown .el-scrollbar__wrap) {
    scrollbar-width: none;
    -ms-overflow-style: none;
}

:global(.level-select-dropdown .el-select-dropdown__wrap::-webkit-scrollbar),
:global(.level-select-dropdown .el-scrollbar__wrap::-webkit-scrollbar) {
    display: none;
    width: 0;
    height: 0;
}

:global(.level-select-dropdown .el-scrollbar__bar) {
    display: none !important;
}

:global(.level-select-dropdown .el-select-dropdown__item) {
    overflow: visible;
    padding: 0 20px !important;
    text-overflow: clip;
    white-space: nowrap;
}

:global(.level-select-dropdown .el-select-dropdown__item span) {
    overflow: visible;
    text-overflow: clip;
}

.json-tool-root.theme-dark :deep(.el-button) {
    background-color: var(--json-tool-button-bg);
    border-color: var(--json-tool-button-border);
    color: var(--json-tool-button-text);
    box-shadow: none;
}

.json-tool-root.theme-dark :deep(.el-button:hover),
.json-tool-root.theme-dark :deep(.el-button:focus) {
    background-color: var(--json-tool-button-hover-bg);
    border-color: var(--json-tool-button-hover-border);
    color: #f5f5f5;
}

.json-tool-root.theme-dark :deep(.el-button.is-disabled),
.json-tool-root.theme-dark :deep(.el-button.is-disabled:hover),
.json-tool-root.theme-dark :deep(.el-button.is-disabled:focus) {
    background-color: #242424;
    border-color: #2f2f2f;
    color: #6f6f6f;
}

.json-tool-root.theme-dark :deep(.el-button--primary) {
    background-color: #1d4f73;
    border-color: #28658e;
    color: #e8f4ff;
}

.json-tool-root.theme-dark :deep(.el-button--primary:hover),
.json-tool-root.theme-dark :deep(.el-button--primary:focus) {
    background-color: #28658e;
    border-color: #3478a5;
    color: #ffffff;
}

.json-tool-root.theme-dark :deep(.el-button--primary:active) {
    background-color: #194765;
    border-color: #28658e;
}

.json-tool-root.theme-dark :deep(.el-button--success) {
    background-color: #265b39;
    border-color: #327a4c;
    color: #e8fff0;
}

.json-tool-root.theme-dark :deep(.el-button--success:hover),
.json-tool-root.theme-dark :deep(.el-button--success:focus) {
    background-color: #327a4c;
    border-color: #409a61;
}

.json-tool-root.theme-dark :deep(.el-button--warning) {
    background-color: #765a18;
    border-color: #9a7420;
    color: #fff6d7;
}

.json-tool-root.theme-dark :deep(.el-button--warning:hover),
.json-tool-root.theme-dark :deep(.el-button--warning:focus) {
    background-color: #8b6a1d;
    border-color: #b48524;
}

.json-tool-root.theme-dark :deep(.el-button--danger) {
    background-color: #743333;
    border-color: #954343;
    color: #ffecec;
}

.json-tool-root.theme-dark :deep(.el-button--danger:hover),
.json-tool-root.theme-dark :deep(.el-button--danger:focus) {
    background-color: #8b3c3c;
    border-color: #ad4e4e;
}

.json-tool-root.theme-dark :deep(.el-button--info) {
    background-color: #3a3a3a;
    border-color: #4a4a4a;
    color: #e0e0e0;
}

.json-tool-root.theme-dark :deep(.el-button--info:hover),
.json-tool-root.theme-dark :deep(.el-button--info:focus) {
    background-color: #464646;
    border-color: #5a5a5a;
}

.json-tool-root.theme-dark :deep(.el-button-group .el-button:not(:first-child)) {
    border-left-color: rgba(255, 255, 255, 0.12);
}

.json-tool-root.theme-dark :deep(.el-select__wrapper) {
    background-color: var(--json-tool-button-bg);
    box-shadow: 0 0 0 1px var(--json-tool-button-border) inset;
}

.json-tool-root.theme-dark :deep(.el-select__wrapper:hover),
.json-tool-root.theme-dark :deep(.el-select__wrapper.is-focused) {
    box-shadow: 0 0 0 1px var(--json-tool-button-hover-border) inset;
}

.json-tool-root.theme-dark :deep(.el-select__selected-item),
.json-tool-root.theme-dark :deep(.el-select__placeholder),
.json-tool-root.theme-dark :deep(.el-select .el-icon) {
    color: var(--json-tool-button-text);
}

:global(body.json-tool-theme-dark) {
    --json-tool-theme-transition: background-color 120ms ease, color 100ms ease, border-color 120ms ease;
    --json-tool-bg: #181818;
    --json-tool-surface: #1f1f1f;
    --json-tool-surface-soft: #181818;
    --json-tool-surface-raised: #242424;
    --json-tool-border: #2b2b2b;
    --json-tool-border-strong: #3a3a3a;
    --json-tool-text: #cccccc;
    --json-tool-text-muted: #9da0a6;
    --json-tool-input-bg: #252525;
    --json-tool-input-border: #3a3a3a;
    --json-tool-input-hover-border: #4a4a4a;
    --json-tool-button-bg: #2a2a2a;
    --json-tool-button-border: #3a3a3a;
    --json-tool-button-text: #d4d4d4;
    --json-tool-button-hover-bg: #333333;
    --json-tool-button-hover-border: #4a4a4a;
}

:global(body.json-tool-theme-dark .el-overlay) {
    background-color: rgba(0, 0, 0, 0.64);
}

:global(body.json-tool-theme-dark .el-dialog),
:global(body.json-tool-theme-dark .el-message-box),
:global(body.json-tool-theme-dark .el-popover),
:global(body.json-tool-theme-dark .el-popper.is-light) {
    background: var(--json-tool-surface) !important;
    border: 1px solid var(--json-tool-border) !important;
    color: var(--json-tool-text) !important;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5) !important;
    transition: var(--json-tool-theme-transition) !important;
}

:global(body.json-tool-theme-dark .el-popper),
:global(body.json-tool-theme-dark .el-select__popper),
:global(body.json-tool-theme-dark .el-dropdown__popper) {
    --el-bg-color-overlay: var(--json-tool-surface);
    --el-fill-color-light: #2a2d35;
    --el-fill-color-lighter: #252525;
    --el-fill-color-blank: var(--json-tool-surface);
    --el-border-color-light: var(--json-tool-border);
    --el-text-color-regular: var(--json-tool-text);
    --el-text-color-secondary: var(--json-tool-text-muted);
    --el-color-primary-light-9: rgba(64, 158, 255, 0.16);
    background: var(--json-tool-surface) !important;
    border-color: var(--json-tool-border) !important;
    color: var(--json-tool-text) !important;
    transition: var(--json-tool-theme-transition) !important;
}

:global(body.json-tool-theme-dark .el-popper.is-light .el-popper__arrow::before) {
    background: var(--json-tool-surface) !important;
    border-color: var(--json-tool-border) !important;
}

:global(body.json-tool-theme-dark .el-message),
:global(body.json-tool-theme-dark .el-notification) {
    --el-message-bg-color: var(--json-tool-surface-raised);
    --el-message-border-color: var(--json-tool-border);
    --el-message-text-color: var(--json-tool-text);
    --el-notification-bg-color: var(--json-tool-surface-raised);
    --el-notification-border-color: var(--json-tool-border);
    --el-notification-title-color: var(--json-tool-text);
    --el-notification-content-color: var(--json-tool-text-muted);
    background-color: var(--json-tool-surface-raised) !important;
    border-color: var(--json-tool-border) !important;
    color: var(--json-tool-text) !important;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45) !important;
}

:global(body.json-tool-theme-dark .el-message__content),
:global(body.json-tool-theme-dark .el-notification__title) {
    color: var(--json-tool-text) !important;
}

:global(body.json-tool-theme-dark .el-notification__content),
:global(body.json-tool-theme-dark .el-notification__closeBtn) {
    color: var(--json-tool-text-muted) !important;
}

:global(body.json-tool-theme-dark .el-message--success),
:global(body.json-tool-theme-dark .json-tool-message.el-message--success) {
    background-color: rgba(38, 91, 57, 0.92) !important;
    border-color: rgba(50, 122, 76, 0.95) !important;
}

:global(body.json-tool-theme-dark .el-message--warning),
:global(body.json-tool-theme-dark .json-tool-message.el-message--warning) {
    background-color: rgba(118, 90, 24, 0.92) !important;
    border-color: rgba(154, 116, 32, 0.95) !important;
}

:global(body.json-tool-theme-dark .el-message--error),
:global(body.json-tool-theme-dark .json-tool-message.el-message--error) {
    background-color: rgba(116, 51, 51, 0.92) !important;
    border-color: rgba(149, 67, 67, 0.95) !important;
}

:global(body.json-tool-theme-dark .el-message--info),
:global(body.json-tool-theme-dark .json-tool-message.el-message--info) {
    background-color: rgba(36, 36, 36, 0.96) !important;
    border-color: var(--json-tool-border-strong) !important;
}

:global(body.json-tool-theme-dark .el-message .el-message__icon) {
    filter: brightness(1.12);
}

:global(body.json-tool-theme-dark .el-dialog__header),
:global(body.json-tool-theme-dark .el-message-box__header) {
    border-bottom: 1px solid var(--json-tool-border) !important;
    background: linear-gradient(to bottom, #232323, #1f1f1f) !important;
}

:global(body.json-tool-theme-dark .el-dialog__body),
:global(body.json-tool-theme-dark .el-message-box__content) {
    color: var(--json-tool-text) !important;
    background: var(--json-tool-surface) !important;
}

:global(body.json-tool-theme-dark .el-dialog__footer),
:global(body.json-tool-theme-dark .el-message-box__btns) {
    border-top: 1px solid var(--json-tool-border) !important;
    background: var(--json-tool-surface) !important;
}

:global(body.json-tool-theme-dark .delete-archive-message-box .el-message-box__header),
:global(body.json-tool-theme-dark .delete-archive-message-box .el-message-box__btns) {
    border: 0 !important;
    background: var(--json-tool-surface) !important;
    box-shadow: none !important;
}

:global(body.json-tool-theme-dark .el-dialog__title),
:global(body.json-tool-theme-dark .el-message-box__title),
:global(body.json-tool-theme-dark .dialog-title),
:global(body.json-tool-theme-dark .dialog-title-with-close),
:global(body.json-tool-theme-dark .section-title),
:global(body.json-tool-theme-dark .config-name),
:global(body.json-tool-theme-dark .saved-rule-name),
:global(body.json-tool-theme-dark .field-path-label) {
    color: var(--json-tool-text) !important;
}

:global(body.json-tool-theme-dark .form-label),
:global(body.json-tool-theme-dark .form-label-row .form-label),
:global(body.json-tool-theme-dark .form-hint),
:global(body.json-tool-theme-dark .field-label),
:global(body.json-tool-theme-dark .rule-name-label),
:global(body.json-tool-theme-dark .preview-label),
:global(body.json-tool-theme-dark .preview-value),
:global(body.json-tool-theme-dark .config-details),
:global(body.json-tool-theme-dark .config-url),
:global(body.json-tool-theme-dark .config-headers),
:global(body.json-tool-theme-dark .saved-rule-meta),
:global(body.json-tool-theme-dark .delete-confirm-text),
:global(body.json-tool-theme-dark .empty-hint),
:global(body.json-tool-theme-dark .textarea-counter) {
    color: var(--json-tool-text-muted) !important;
}

:global(body.json-tool-theme-dark .dialog-close-btn),
:global(body.json-tool-theme-dark .demo-close-btn),
:global(body.json-tool-theme-dark .el-dialog__headerbtn .el-dialog__close) {
    color: var(--json-tool-text-muted) !important;
}

:global(body.json-tool-theme-dark .dialog-close-btn:hover),
:global(body.json-tool-theme-dark .demo-close-btn:hover),
:global(body.json-tool-theme-dark .el-dialog__headerbtn:hover .el-dialog__close) {
    background: var(--json-tool-button-hover-bg) !important;
    color: #f5f5f5 !important;
}

:global(body.json-tool-theme-dark .el-input__wrapper),
:global(body.json-tool-theme-dark .el-textarea__inner),
:global(body.json-tool-theme-dark .el-select__wrapper),
:global(body.json-tool-theme-dark .el-input-number__decrease),
:global(body.json-tool-theme-dark .el-input-number__increase) {
    --el-input-bg-color: var(--json-tool-input-bg);
    --el-input-text-color: var(--json-tool-text);
    --el-input-border-color: var(--json-tool-input-border);
    --el-input-hover-border-color: var(--json-tool-input-hover-border);
    --el-input-focus-border-color: var(--el-color-primary);
    --el-fill-color-blank: var(--json-tool-input-bg);
    background-color: var(--json-tool-input-bg) !important;
    border-color: var(--json-tool-input-border) !important;
    box-shadow: 0 0 0 1px var(--json-tool-input-border) inset !important;
    color: var(--json-tool-text) !important;
}

:global(body.json-tool-theme-dark .el-input__wrapper:hover),
:global(body.json-tool-theme-dark .el-textarea__inner:hover),
:global(body.json-tool-theme-dark .el-select__wrapper:hover) {
    box-shadow: 0 0 0 1px var(--json-tool-input-hover-border) inset !important;
}

:global(body.json-tool-theme-dark .el-input__wrapper.is-focus),
:global(body.json-tool-theme-dark .el-input.is-focus .el-input__wrapper),
:global(body.json-tool-theme-dark .el-textarea__inner:focus),
:global(body.json-tool-theme-dark .el-select__wrapper.is-focused) {
    background-color: var(--json-tool-input-bg) !important;
    box-shadow: 0 0 0 1px var(--el-color-primary) inset !important;
}

:global(body.json-tool-theme-dark .el-input__inner),
:global(body.json-tool-theme-dark .el-textarea__inner),
:global(body.json-tool-theme-dark .el-select__selected-item),
:global(body.json-tool-theme-dark .el-select__placeholder),
:global(body.json-tool-theme-dark .el-input .el-icon),
:global(body.json-tool-theme-dark .el-select .el-icon),
:global(body.json-tool-theme-dark .el-input-number .el-icon) {
    background-color: transparent !important;
    color: var(--json-tool-text) !important;
}

:global(body.json-tool-theme-dark .el-input__inner:-webkit-autofill),
:global(body.json-tool-theme-dark .el-input__inner:-webkit-autofill:hover),
:global(body.json-tool-theme-dark .el-input__inner:-webkit-autofill:focus) {
    -webkit-text-fill-color: var(--json-tool-text) !important;
    box-shadow: 0 0 0 1000px var(--json-tool-input-bg) inset !important;
    caret-color: var(--json-tool-text) !important;
}

:global(body.json-tool-theme-dark .el-input__inner::placeholder),
:global(body.json-tool-theme-dark .el-textarea__inner::placeholder) {
    color: #71717a !important;
}

:global(body.json-tool-theme-dark .el-input__count),
:global(body.json-tool-theme-dark .el-input__count-inner),
:global(body.json-tool-theme-dark .el-textarea .el-input__count),
:global(body.json-tool-theme-dark .el-textarea__word-limit),
:global(body.json-tool-theme-dark .el-textarea__word-limit .el-input__count-inner) {
    background: var(--json-tool-input-bg) !important;
    color: var(--json-tool-text-muted) !important;
}

:global(body.json-tool-theme-dark .el-alert) {
    background-color: var(--json-tool-surface-raised) !important;
    border: 1px solid var(--json-tool-border) !important;
    color: var(--json-tool-text-muted) !important;
}

:global(body.json-tool-theme-dark .el-alert--info) {
    background-color: #242424 !important;
    border-color: #333333 !important;
}

:global(body.json-tool-theme-dark .el-alert__title),
:global(body.json-tool-theme-dark .el-alert__content),
:global(body.json-tool-theme-dark .el-alert__description) {
    color: var(--json-tool-text-muted) !important;
}

:global(body.json-tool-theme-dark .el-alert__title strong) {
    color: var(--json-tool-text) !important;
}

:global(body.json-tool-theme-dark .el-alert__icon) {
    color: #9da0a6 !important;
}

:global(body.json-tool-theme-dark .el-button) {
    background-color: var(--json-tool-button-bg) !important;
    border-color: var(--json-tool-button-border) !important;
    color: var(--json-tool-button-text) !important;
}

:global(body.json-tool-theme-dark .el-button:hover),
:global(body.json-tool-theme-dark .el-button:focus) {
    background-color: var(--json-tool-button-hover-bg) !important;
    border-color: var(--json-tool-button-hover-border) !important;
    color: #f5f5f5 !important;
}

:global(body.json-tool-theme-dark .el-button--primary) {
    background-color: #1d4f73 !important;
    border-color: #28658e !important;
    color: #e8f4ff !important;
}

:global(body.json-tool-theme-dark .el-button--primary:hover),
:global(body.json-tool-theme-dark .el-button--primary:focus) {
    background-color: #28658e !important;
    border-color: #3478a5 !important;
}

:global(body.json-tool-theme-dark .json-tool-root.theme-dark .preview-download-button.el-button--info.is-plain) {
    background-color: rgba(245, 247, 250, 0.1) !important;
    border-color: rgba(245, 247, 250, 0.2) !important;
    color: rgba(245, 247, 250, 0.92) !important;
}

:global(body.json-tool-theme-dark .json-tool-root.theme-dark .preview-download-button.el-button--info.is-plain:hover),
:global(body.json-tool-theme-dark .json-tool-root.theme-dark .preview-download-button.el-button--info.is-plain:focus) {
    background-color: rgba(245, 247, 250, 0.18) !important;
    border-color: rgba(245, 247, 250, 0.3) !important;
    color: #ffffff !important;
}

:global(body.json-tool-theme-dark .json-tool-root.theme-dark .preview-download-button.el-button--info.is-plain:active) {
    background-color: rgba(245, 247, 250, 0.14) !important;
    border-color: rgba(245, 247, 250, 0.24) !important;
    color: rgba(245, 247, 250, 0.94) !important;
}

:global(body.json-tool-theme-dark .el-button--success) {
    background-color: #265b39 !important;
    border-color: #327a4c !important;
    color: #e8fff0 !important;
}

:global(body.json-tool-theme-dark .el-button--success:hover),
:global(body.json-tool-theme-dark .el-button--success:focus) {
    background-color: #327a4c !important;
    border-color: #409a61 !important;
    color: #ffffff !important;
}

:global(body.json-tool-theme-dark .el-button--success:active) {
    background-color: #1f4a2f !important;
    border-color: #327a4c !important;
    color: #e8fff0 !important;
}

:global(body.json-tool-theme-dark .el-button--warning) {
    background-color: #765a18 !important;
    border-color: #9a7420 !important;
    color: #fff6d7 !important;
}

:global(body.json-tool-theme-dark .el-button--danger) {
    background-color: #743333 !important;
    border-color: #954343 !important;
    color: #ffecec !important;
}

:global(body.json-tool-theme-dark .el-button--danger:hover),
:global(body.json-tool-theme-dark .el-button--danger:focus) {
    background-color: #8b3c3c !important;
    border-color: #ad4e4e !important;
    color: #ffffff !important;
}

:global(body.json-tool-theme-dark .el-button--danger:active) {
    background-color: #5f2a2a !important;
    border-color: #8b3c3c !important;
    color: #ffecec !important;
}

:global(body.json-tool-theme-dark .el-button.is-disabled),
:global(body.json-tool-theme-dark .el-button.is-disabled:hover) {
    background-color: #242424 !important;
    border-color: #2f2f2f !important;
    color: #6f6f6f !important;
}

:global(body.json-tool-theme-dark .el-radio-button__inner),
:global(body.json-tool-theme-dark .el-checkbox__inner) {
    background-color: var(--json-tool-input-bg) !important;
    border-color: var(--json-tool-input-border) !important;
    color: var(--json-tool-text-muted) !important;
}

:global(body.json-tool-theme-dark .el-radio-button__original-radio:checked + .el-radio-button__inner),
:global(body.json-tool-theme-dark .el-checkbox__input.is-checked .el-checkbox__inner) {
    background-color: #1d4f73 !important;
    border-color: #28658e !important;
    color: #fff !important;
}

:global(body.json-tool-theme-dark .el-checkbox__label),
:global(body.json-tool-theme-dark .el-radio__label) {
    color: var(--json-tool-text) !important;
}

:global(body.json-tool-theme-dark .el-dropdown-menu),
:global(body.json-tool-theme-dark .el-select-dropdown),
:global(body.json-tool-theme-dark .el-select-dropdown__wrap),
:global(body.json-tool-theme-dark .el-select-dropdown__list),
:global(body.json-tool-theme-dark .el-autocomplete-suggestion),
:global(body.json-tool-theme-dark .el-autocomplete-suggestion__wrap) {
    background-color: var(--json-tool-surface) !important;
    border-color: var(--json-tool-border) !important;
}

:global(body.json-tool-theme-dark .el-dropdown-menu__item),
:global(body.json-tool-theme-dark .el-select-dropdown__item),
:global(body.json-tool-theme-dark .el-autocomplete-suggestion li) {
    color: var(--json-tool-text) !important;
}

:global(body.json-tool-theme-dark .el-dropdown-menu__item:hover),
:global(body.json-tool-theme-dark .el-dropdown-menu__item:focus),
:global(body.json-tool-theme-dark .el-select-dropdown__item.hover),
:global(body.json-tool-theme-dark .el-select-dropdown__item.is-hovering),
:global(body.json-tool-theme-dark .el-select-dropdown__item:focus),
:global(body.json-tool-theme-dark .el-select-dropdown__item:hover),
:global(body.json-tool-theme-dark .el-autocomplete-suggestion li:hover),
:global(body.json-tool-theme-dark .el-autocomplete-suggestion li.highlighted) {
    background-color: #2a2d35 !important;
}

:global(body.json-tool-theme-dark .el-select-dropdown__item.is-selected),
:global(body.json-tool-theme-dark .el-select-dropdown__item.selected),
:global(body.json-tool-theme-dark .el-dropdown-menu__item.is-active) {
    background-color: rgba(64, 158, 255, 0.16) !important;
    color: #e8f4ff !important;
}

:global(body.json-tool-theme-dark .el-select-dropdown__item.is-disabled),
:global(body.json-tool-theme-dark .el-select-dropdown__item.is-disabled:hover),
:global(body.json-tool-theme-dark .el-select-dropdown__item.is-disabled.is-hovering) {
    background-color: var(--json-tool-surface) !important;
    color: #6f6f6f !important;
}

:global(body.json-tool-theme-dark .el-table),
:global(body.json-tool-theme-dark .el-table tr),
:global(body.json-tool-theme-dark .el-table th.el-table__cell),
:global(body.json-tool-theme-dark .el-table td.el-table__cell) {
    --el-table-border-color: var(--json-tool-border);
    --el-table-border: 1px solid var(--json-tool-border);
    --el-table-text-color: var(--json-tool-text);
    --el-table-header-text-color: var(--json-tool-text);
    --el-table-header-bg-color: var(--json-tool-surface);
    --el-table-tr-bg-color: var(--json-tool-surface);
    --el-table-row-hover-bg-color: #2a2d35;
    background-color: var(--json-tool-surface) !important;
    color: var(--json-tool-text) !important;
    border-color: var(--json-tool-border) !important;
}

:global(body.json-tool-theme-dark .el-table::before),
:global(body.json-tool-theme-dark .el-table::after),
:global(body.json-tool-theme-dark .el-table__inner-wrapper::before),
:global(body.json-tool-theme-dark .el-table__inner-wrapper::after),
:global(body.json-tool-theme-dark .el-table--border::before),
:global(body.json-tool-theme-dark .el-table--border::after),
:global(body.json-tool-theme-dark .el-table__border-left-patch) {
    background-color: var(--json-tool-border) !important;
}

:global(body.json-tool-theme-dark .el-table--enable-row-hover .el-table__body tr:hover > td.el-table__cell) {
    background-color: #2a2d35 !important;
}

:global(body.json-tool-theme-dark .el-empty__description),
:global(body.json-tool-theme-dark .el-descriptions__label),
:global(body.json-tool-theme-dark .el-descriptions__content) {
    color: var(--json-tool-text-muted) !important;
}

:global(body.json-tool-theme-dark .form-value-quote--compact),
:global(body.json-tool-theme-dark .empty-hint),
:global(body.json-tool-theme-dark .config-preview),
:global(body.json-tool-theme-dark .config-item),
:global(body.json-tool-theme-dark .rule-item),
:global(body.json-tool-theme-dark .field-path-item),
:global(body.json-tool-theme-dark .saved-rule-item) {
    background-color: var(--json-tool-surface-raised) !important;
    border-color: var(--json-tool-border) !important;
    color: var(--json-tool-text) !important;
}

:global(body.json-tool-theme-dark .config-item:hover),
:global(body.json-tool-theme-dark .saved-rule-item:hover) {
    background-color: #2a2d35 !important;
    border-color: var(--json-tool-border-strong) !important;
}

:global(body.json-tool-theme-dark .form-compact-line),
:global(body.json-tool-theme-dark .form-value-text),
:global(body.json-tool-theme-dark .path-text),
:global(body.json-tool-theme-dark .saved-rule-name) {
    color: var(--json-tool-text) !important;
}

:global(body.json-tool-theme-dark .path-type) {
    color: var(--json-tool-text-muted) !important;
}

:global(body.json-tool-theme-dark .delete-confirm) {
    background-color: rgba(116, 51, 51, 0.32) !important;
    border-color: rgba(149, 67, 67, 0.72) !important;
}

:global(body.json-tool-theme-dark .field-path-delete-btn) {
    background-color: rgba(116, 51, 51, 0.42) !important;
    color: #ffb4b4 !important;
}

:global(body.json-tool-theme-dark .field-path-delete-btn:hover) {
    background-color: rgba(139, 60, 60, 0.62) !important;
}

:global(body.json-tool-theme-dark code),
:global(body.json-tool-theme-dark [style*='background: #fff']) {
    background: #2a2a2a !important;
    color: #d4d4d4 !important;
}

:global(body.json-tool-theme-dark [style*='background-color: #fef0f0']) {
    background-color: rgba(116, 51, 51, 0.32) !important;
    color: #ffb4b4 !important;
}

:global(body.json-tool-theme-dark [style*='color: #303133']) {
    color: var(--json-tool-text) !important;
}

:global(body.json-tool-theme-dark [style*='color: #606266']),
:global(body.json-tool-theme-dark [style*='color: #909399']) {
    color: var(--json-tool-text-muted) !important;
}

/* 响应式：小屏幕时调整布局 */
@media screen and (max-width: 1200px) {
    .tool-bar > .el-button,
    .tool-bar > .el-button-group,
    .tool-bar > .el-dropdown,
    .tool-bar > .collapse-control {
        margin-left: 8px;
    }
}

/* 同步滚动按钮自定义为蓝色 */
.editor-container {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    position: relative;
    padding: 0;
}

.editor-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    box-shadow: var(--json-tool-shadow);
    margin: 0;
    min-width: 0; /* 允许面板宽度为0以实现折叠效果 */
    position: relative;
    transition:
        width 0.1s ease,
        var(--json-tool-theme-transition);
}

/* 添加分隔线样式 */
.resizer {
    /* 原网站使用 content-box：20px 内容宽度加左右各 1px 边框。 */
    box-sizing: content-box;
    width: 20px;
    background-color: var(--json-tool-surface-soft);
    cursor: col-resize;
    touch-action: none;
    position: relative;
    z-index: 10;
    transition:
        background-color 120ms ease,
        border-color 120ms ease;
    border-left: 1px solid var(--json-tool-border);
    border-right: 1px solid var(--json-tool-border);
    display: flex;
    align-items: center;
    justify-content: center;
}

.resizer:hover:not(:has(.transfer-button:hover)),
.resizer:active:not(:has(.transfer-button:active)) {
    background-color: color-mix(in srgb, var(--json-tool-surface-soft) 92%, var(--json-tool-text) 8%);
}

.resizer::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 4px;
    height: 40px;
    background-color: #c0c4cc;
}

.json-tool-root.theme-dark .resizer::after {
    background-color: var(--json-tool-border-strong);
}

/* 演示模式下锁定分割线：
   - 改为 not-allowed 光标，暗示"此刻不可拖动"
   - hover/active 不再变色（避免误导用户以为还能拖）
   - 核心的拖动拦截在 startResize 函数里做，这里只做视觉反馈 */
.resizer.resizer-locked-during-demo {
    cursor: not-allowed;
}
.resizer.resizer-locked-during-demo:hover,
.resizer.resizer-locked-during-demo:active {
    background-color: var(--json-tool-surface-soft);
}
.resizer.resizer-locked-during-demo::after {
    background-color: #dcdfe6;
}

.json-tool-root.theme-dark .resizer.resizer-locked-during-demo::after {
    background-color: var(--json-tool-border);
}

/* 演示模式下的通用锁定遮罩层：
   - 阻断所有鼠标/触摸事件（按钮不可点、下拉不展开）
   - 视觉上降亮度并移除交互反馈色
   - 当前用于工具栏（除"设置"按钮外），将来如需锁定其它区域直接加该类即可 */
.demo-locked-area {
    pointer-events: none;
    opacity: 0.55;
    filter: grayscale(0.2);
    user-select: none;
    transition:
        opacity 0.2s,
        filter 0.2s;
}

/* 工具栏内部的"功能按钮分组"容器：
   仅作为"演示期间整体禁用"的挂载点，必须对布局保持透明——
   继承 .tool-bar 的 flex 方向/对齐，让内部按钮依然像原来一样单行排列。
   注意：作为 .tool-bar 的直接子元素，它本身也需要和前面的"设置"按钮保持 10px 间距，
   这正是原样式靠 `.tool-bar > .el-button-group` 的 margin-left 自然获得的效果。 */
.tool-bar > .toolbar-actions {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 0;
    flex: 1 1 auto;
    min-width: 0;
    margin-left: 10px;
}

/* 由于在 .tool-bar 里新增了 .toolbar-actions 包裹层，
   原本依赖 `.tool-bar > .el-button-group` 直接子选择器的间距规则失效，
   这里对 .toolbar-actions 的直接子元素复刻同一套 margin，保持视觉一致。 */
.tool-bar > .toolbar-actions > .el-button,
.tool-bar > .toolbar-actions > .el-button-group,
.tool-bar > .toolbar-actions > .el-dropdown,
.tool-bar > .toolbar-actions > .collapse-control {
    margin-left: 10px;
    flex-shrink: 0;
    white-space: nowrap;
}

.tool-bar > .toolbar-actions > .el-button:first-child,
.tool-bar > .toolbar-actions > .el-button-group:first-child,
.tool-bar > .toolbar-actions > .el-dropdown:first-child,
.tool-bar > .toolbar-actions > .collapse-control:first-child {
    margin-left: 0;
}

.panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
    height: 35px;
    padding: 5px 15px;
    background: var(--json-tool-surface-header);
    border-bottom: 1px solid var(--json-tool-border);
    box-sizing: border-box;
    cursor: pointer;
    transition: none !important;
}

.panel-title {
    display: flex;
    align-items: center;
    font-size: 15px;
    font-weight: 600;
    color: var(--json-tool-text);
    /* 防止标题换行，当宽度不足时按钮会立即隐藏 */
    white-space: nowrap;
    flex-shrink: 0;
    user-select: none;
}

.panel-title i {
    margin-right: 6px;
    color: #409eff;
}

.panel-actions {
    display: flex;
    gap: 12px;
    /* 确保按钮显示/隐藏是瞬时的，无过渡动画，避免拖动时标题换行 */
    transition: none !important;
    /* 当按钮应该隐藏时，使用透明度和禁用事件而不是display none，保持空间占用 */
    opacity: var(--panel-actions-opacity, 1);
    pointer-events: var(--panel-actions-pointer-events, auto);
}

/* 确保按钮元素本身也没有过渡效果（包括 Element Plus 的过渡） */
.panel-actions :deep(.el-button) {
    transition: none !important;
    animation: none !important;
}

/* 确保按钮的图标和文字也没有过渡效果 */
.panel-actions :deep(.el-button *),
.panel-actions :deep(.el-button span) {
    transition: none !important;
}

.panel-actions :deep(.el-button + .el-button) {
    margin-left: 0 !important;
}

.editor-wrapper {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
}

.editor-wrapper--drag-active .monaco-editor-container {
    background: linear-gradient(0deg, rgba(64, 158, 255, 0.04), rgba(64, 158, 255, 0.04)), #ffffff;
}

.editor-drag-upload-overlay {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
    pointer-events: none;
    background: rgba(255, 255, 255, 0.72);
}

.editor-drag-upload-card {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    color: #2f5fae;
    font-size: 13px;
    font-weight: 600;
    border: 1px dashed rgba(64, 158, 255, 0.55);
    border-radius: 10px;
    background: rgba(245, 250, 255, 0.96);
    box-shadow: 0 6px 24px rgba(64, 158, 255, 0.1);
}

.editor-drag-upload-icon {
    font-size: 16px;
}

.first-use-guide {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: var(--first-use-guide-left, 0);
    z-index: 12;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    pointer-events: none;
    background:
        radial-gradient(circle at 50% 42%, rgba(64, 158, 255, 0.08), transparent 34%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.54));
}

.first-use-guide-card {
    width: min(420px, calc(100% - 48px));
    padding: 20px 22px 18px;
    pointer-events: auto;
    border: 1px solid rgba(64, 158, 255, 0.18);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 18px 52px rgba(31, 45, 61, 0.14);
}

.first-use-guide-title {
    margin: 0;
    color: #1f2d3d;
    font-size: 18px;
    font-weight: 700;
    line-height: 1.35;
}

.first-use-guide-desc {
    margin: 10px 0 0;
    color: #5f6673;
    font-size: 13px;
    line-height: 1.7;
}

.first-use-guide-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 18px;
}

.first-use-guide-actions :deep(.el-button--small) {
    height: 24px;
}

.first-use-guide-skip {
    height: 24px;
    padding: 4px 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    color: #606266;
    font-size: 13px;
    line-height: 1;
    border: 1px solid #dcdfe6;
    border-radius: 4px;
    background: #ffffff;
    cursor: pointer;
    transition:
        color 140ms ease,
        border-color 140ms ease,
        background-color 140ms ease;
}

.first-use-guide-skip:hover,
.first-use-guide-skip:focus-visible {
    color: #409eff;
    border-color: #a0cfff;
    background: #ecf5ff;
    outline: none;
}

.json-tool-root.theme-dark .first-use-guide {
    background:
        radial-gradient(circle at 50% 42%, rgba(67, 156, 219, 0.12), transparent 34%),
        linear-gradient(180deg, rgba(31, 31, 31, 0.78), rgba(31, 31, 31, 0.54));
}

.json-tool-root.theme-dark .first-use-guide-card {
    border-color: rgba(255, 255, 255, 0.09);
    background: rgba(36, 36, 36, 0.96);
    box-shadow: 0 18px 54px rgba(0, 0, 0, 0.36);
}

.json-tool-root.theme-dark .first-use-guide-title {
    color: #e8e8e8;
}

.json-tool-root.theme-dark .first-use-guide-desc {
    color: #a8abb2;
}

.json-tool-root.theme-dark .first-use-guide-skip {
    color: #d4d4d4;
    border-color: #3a3a3a;
    background: #2a2a2a;
}

.json-tool-root.theme-dark .first-use-guide-skip:hover,
.json-tool-root.theme-dark .first-use-guide-skip:focus-visible {
    color: #b9d7ff;
    border-color: #4f6f94;
    background: #26313d;
}

.monaco-editor-container {
    flex: 1;
    min-height: 0;
    background-color: var(--json-tool-editor-bg);
    border-top: none;
    border-bottom: none;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
    transition: background-color 160ms ease;
}

.monaco-editor-instance {
    flex: 1;
    min-height: 0;
    position: relative;
}

/* 错误导航：内联于编辑区域底部状态栏 */
.error-nav-inline {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    padding-left: 8px;
    user-select: none;
    line-height: 1;
}

.error-nav-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
}

.error-warning-icon {
    color: #f56c6c;
    font-size: 13px;
}

.error-nav-count {
    font-size: 12px;
    font-weight: 600;
    color: #f56c6c;
    min-width: 14px;
    text-align: left;
}

.error-nav-btn {
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
        background-color 120ms ease,
        border-color 120ms ease,
        transform 60ms ease;
}

.error-nav-btn:hover {
    background: rgba(0, 0, 0, 0.05);
    border-color: rgba(0, 0, 0, 0.08);
}

.error-nav-btn:active {
    background: rgba(0, 0, 0, 0.1);
    border-color: rgba(0, 0, 0, 0.12);
    transform: translateY(0.5px);
}

.error-nav-btn:focus-visible {
    outline: 2px solid rgba(245, 108, 108, 0.35);
    outline-offset: 1px;
}

.error-nav-arrow {
    color: var(--json-tool-text-muted);
    font-size: 12px;
}

.error-nav-btn:hover .error-nav-arrow {
    color: var(--json-tool-text);
}

.error-nav-arrow :deep(svg) {
    width: 12px;
    height: 12px;
}
.error-nav-arrow :deep(svg path),
.error-nav-arrow :deep(svg polyline),
.error-nav-arrow :deep(svg line) {
    stroke-width: 2.6;
}

/* 编辑器状态栏样式 */
.editor-status-bar {
    background: var(--json-tool-surface-status);
    border-top: none;
    display: flex;
    align-items: center;
    padding: 0 10px;
    flex-shrink: 0;
    font-size: 12px;
    color: var(--json-tool-text-muted);
    box-shadow: 0 -1px 2px rgba(0, 0, 0, 0.02);
    transition: var(--json-tool-theme-transition);
}

.editor-status-bar .status-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    user-select: none;
    white-space: nowrap;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;
}

.editor-status-bar--output {
    justify-content: space-between;
    gap: 10px;
}

.status-action-menu {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    margin-left: auto;
}

.status-action-button {
    height: 20px;
    min-width: 28px;
    padding: 0 5px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--json-tool-text-muted);
    font-size: 12px;
    line-height: 18px;
    cursor: pointer;
    opacity: 0.88;
    transition:
        background-color 0.16s ease,
        border-color 0.16s ease,
        color 0.16s ease,
        opacity 0.16s ease;
}

.status-action-button--theme {
    min-width: 24px;
    padding: 0 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.status-theme-icon {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.status-theme-icon--sun {
    color: #d08a1f;
}

.status-theme-icon--moon {
    color: #667499;
}

.status-action-button:hover,
.status-action-button:focus-visible {
    background: color-mix(in srgb, var(--json-tool-surface-panel) 86%, var(--json-tool-primary) 14%);
    border-color: color-mix(in srgb, var(--json-tool-border) 72%, transparent);
    color: var(--json-tool-text);
    opacity: 1;
    outline: none;
}

/* 确保Monaco编辑器内部元素也有正确的背景色 */
:deep(.monaco-editor .monaco-editor-background) {
    background-color: var(--json-tool-editor-bg);
}

:deep(.monaco-editor .margin) {
    background-color: var(--json-tool-editor-bg);
}

:deep(.errorLine) {
    background: #ff000020;
    border-left: 3px solid #ff0000;
}

:deep(.errorGlyph) {
    background: #ff0000;
    width: 4px !important;
    margin-left: 3px;
}

:deep(.monaco-editor .margin) {
    background-color: var(--json-tool-surface-soft);
}

/* 调整光标样式 */
:deep(.monaco-editor .cursor) {
    height: 16px !important;
}

:deep(.monaco-editor .indent-guide) {
    box-shadow: 1px 0 0 0 rgba(0, 0, 0, 0.1) inset;
}

:deep(.monaco-editor .indent-guide.active) {
    box-shadow: 1px 0 0 0 rgba(0, 0, 0, 0.2) inset;
}

:deep(.monaco-editor .bracket-match) {
    border: none !important;
    background: transparent !important;
}

/* 自定义当前行高亮样式 */
:deep(.monaco-editor .current-line) {
    background-color: var(--json-tool-current-line) !important;
    border: none !important;
    height: 16px !important;
    /* 设置与行高一致的高度 */
}

/* 禁用行号区域的高亮 */
:deep(.monaco-editor .current-line-margin) {
    background-color: transparent !important;
}

:deep(.monaco-editor .margin .current-line) {
    background-color: transparent !important;
}

.collapse-control {
    display: flex;
    gap: 0;
    align-items: center;
}

/* 当设置弹窗打开时，隐藏其遮罩层的滚动条 */
:deep(.el-overlay-dialog) {
    /* 隐藏滚动条但保持滚动功能 */
    scrollbar-width: none;
    /* Firefox */
    -ms-overflow-style: none;
    /* IE 和 Edge */
}

:deep(.el-overlay-dialog)::-webkit-scrollbar {
    display: none;
    /* Chrome, Safari, Opera */
    width: 0;
    height: 0;
}

:deep(.level-select .el-input__wrapper),
:deep(.level-select .el-select__wrapper) {
    height: 32px;
    padding-left: 6px;
    padding-right: 4px;
    border-radius: 4px 0 0 4px;
    box-shadow: 0 0 0 1px var(--json-tool-level-select-border) inset !important;
}

.collapse-control .level-select :deep(.el-input__wrapper:hover),
.collapse-control .level-select :deep(.el-select__wrapper:hover),
.collapse-control .level-select :deep(.el-input__wrapper.is-focus),
.collapse-control .level-select :deep(.el-select__wrapper.is-focused) {
    box-shadow: 0 0 0 1px var(--json-tool-level-select-hover-border) inset !important;
}

:global(body.json-tool-theme-dark .json-tool-root.theme-dark .collapse-control .level-select .el-input__wrapper),
:global(body.json-tool-theme-dark .json-tool-root.theme-dark .collapse-control .level-select .el-select__wrapper) {
    --el-input-border-color: var(--json-tool-level-select-border);
    --el-input-hover-border-color: var(--json-tool-level-select-hover-border);
    --el-input-focus-border-color: var(--json-tool-level-select-hover-border);
    border-color: var(--json-tool-level-select-border) !important;
    box-shadow: 0 0 0 1px var(--json-tool-level-select-border) inset !important;
}

:global(body.json-tool-theme-dark .json-tool-root.theme-dark .collapse-control .level-select .el-input__wrapper:hover),
:global(body.json-tool-theme-dark .json-tool-root.theme-dark .collapse-control .level-select .el-select__wrapper:hover),
:global(body.json-tool-theme-dark .json-tool-root.theme-dark .collapse-control .level-select .el-input__wrapper.is-focus),
:global(body.json-tool-theme-dark .json-tool-root.theme-dark .collapse-control .level-select .el-select__wrapper.is-focused) {
    border-color: var(--json-tool-level-select-hover-border) !important;
    box-shadow: 0 0 0 1px var(--json-tool-level-select-hover-border) inset !important;
}

.collapse-control .level-select.is-disabled :deep(.el-input__wrapper),
.collapse-control .level-select.is-disabled :deep(.el-select__wrapper),
.collapse-control .level-select :deep(.el-input__wrapper.is-disabled),
.collapse-control .level-select :deep(.el-select__wrapper.is-disabled) {
    box-shadow: 0 0 0 1px var(--json-tool-level-select-disabled-border) inset !important;
}

:global(body.json-tool-theme-dark .json-tool-root.theme-dark .collapse-control .level-select.is-disabled .el-input__wrapper),
:global(body.json-tool-theme-dark .json-tool-root.theme-dark .collapse-control .level-select.is-disabled .el-select__wrapper),
:global(body.json-tool-theme-dark .json-tool-root.theme-dark .collapse-control .level-select .el-input__wrapper.is-disabled),
:global(body.json-tool-theme-dark .json-tool-root.theme-dark .collapse-control .level-select .el-select__wrapper.is-disabled) {
    border-color: var(--json-tool-button-border) !important;
    box-shadow: 0 0 0 1px var(--json-tool-button-border) inset !important;
}

:global(body.json-tool-theme-dark .json-tool-root.theme-dark .collapse-control .level-action-button.level-action-button-disabled-by-level.is-disabled),
:global(body.json-tool-theme-dark .json-tool-root.theme-dark .collapse-control .level-action-button.level-action-button-disabled-by-level.is-disabled:hover),
:global(body.json-tool-theme-dark .json-tool-root.theme-dark .collapse-control .level-action-button.level-action-button-disabled-by-level.is-disabled:focus) {
    background-color: #203126 !important;
    border-color: var(--json-tool-level-select-border) !important;
    color: rgba(232, 255, 240, 0.56) !important;
    opacity: 1;
}

:deep(.level-select .el-select__suffix) {
    margin-left: 4px;
}

:deep(.level-select .el-input__inner) {
    height: 32px;
    line-height: 32px;
}

.editor-loading {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background-color: white;
    z-index: 1;
}

.loading-icon {
    font-size: 24px;
    margin-bottom: 8px;
    animation: rotate 1.5s linear infinite;
}

@keyframes rotate {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}

.monaco-editor-instance {
    width: 100%;
    height: 100%;
    position: relative;
    /* 添加相对定位 */
}

:deep(.el-dropdown-menu__item) {
    padding: 5px 12px;
}

.transfer-button {
    position: absolute;
    top: 7px;
    left: 50%;
    transform: translate(-50%, 0);
    background-color: #e4e7ed;
    cursor: pointer;
    width: 20px;
    height: 20px;
    min-height: 0;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}

.transfer-button svg {
    width: 18px;
    height: 18px;
    color: #409eff;
    display: block;
}

/* 修复 Monaco Editor 查找/替换功能的可访问性问题 */
:deep(.monaco-editor .editor-widget) {
    &[aria-hidden='true'] {
        visibility: hidden !important;
        height: 0 !important;
        overflow: hidden !important;
        opacity: 0 !important;
    }

    &[aria-hidden='false'] {
        visibility: visible !important;
        opacity: 1 !important;
    }
}

/* 批量添加 / 移除前后缀对话框
   - 整体使用 flex 列向布局，节段之间 16px 间距
   - 标题（前缀/后缀）紧贴 add/remove 按钮组
   - 输入框单独占一行；未选择动作时整行变灰，避免视觉噪音 */
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

:deep(.el-dialog__header) {
    padding: 16px 20px 12px;
    border-bottom: 1px solid #e4e7ed;
}

:deep(.el-dialog__title) {
    font-size: 16px;
    font-weight: 500;
    color: #303133;
}

:deep(.el-dialog__body) {
    padding: 20px;
}

:deep(.el-dialog__footer) {
    padding: 12px 20px 16px;
    border-top: 1px solid #e4e7ed;
}

:deep(.el-card) {
    border-radius: 0 !important;
}

:deep(.el-card__body) {
    padding: 16px 20px;
}

:global(.json-tool-message) {
    right: 15px !important;
    left: auto !important;
    transform: translateX(0) !important;
    position: fixed !important;
    z-index: 9999 !important;
}

:deep(.el-divider) {
    margin: 12px 0;
}

:deep(.el-divider--horizontal) {
    border-top-color: #e4e7ed;
}

:deep(.el-tag) {
    border-radius: 4px;
}

:deep(.el-scrollbar__bar) {
    opacity: 0.6;
}

/* 通用对话框头部样式 */
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

/* 存档侧边栏样式 */
.archive-sidebar {
    display: flex;
    flex-direction: column;
    background-color: var(--json-tool-surface-soft);
    padding: 10px 5px;
    box-sizing: border-box;
    transition:
        width 0.1s ease,
        var(--json-tool-theme-transition);
    flex-shrink: 0;
}

.archive-sidebar.collapsed .archive-name {
    text-align: center;
}

.archive-sidebar-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--archive-header-gap, 0px);
    padding-bottom: 6.5px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--json-tool-border);
    cursor: default;
    user-select: none;
}

.archive-header-action-wrap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.archive-header-action {
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 3px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: var(--json-tool-text-muted);
    cursor: pointer;
    transition:
        background-color 0.12s ease,
        color 0.12s ease,
        opacity 0.12s ease;
    overflow: visible;
}

.archive-header-action :deep(.el-icon) {
    font-size: 16px;
    line-height: 1;
}

.archive-header-action:hover:not(:disabled) {
    color: #409eff;
    background: var(--json-tool-archive-drag);
}

.archive-header-action.danger:hover:not(:disabled) {
    color: #f56c6c;
    background: color-mix(in srgb, #f56c6c 16%, transparent);
}

.archive-header-action:disabled {
    color: color-mix(in srgb, var(--json-tool-text-muted) 58%, transparent);
    cursor: not-allowed;
    opacity: 0.8;
    pointer-events: none;
}

/* 存档侧边栏分割线 */
.archive-resizer {
    width: 3px;
    background-color: var(--json-tool-border);
    cursor: col-resize;
    touch-action: none;
    flex-shrink: 0;
    position: relative;
    transition: background-color 0.2s;
}

.archive-resizer:hover {
    background-color: #409eff;
}

.archive-resizer:active {
    background-color: #409eff;
}

.archive-list {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: none;
    scrollbar-color: transparent transparent;
}

.archive-sidebar:hover .archive-list,
.archive-list:focus-within {
    scrollbar-width: thin;
    scrollbar-color: var(--json-tool-archive-scrollbar) transparent;
}

.archive-list::-webkit-scrollbar {
    width: 4px;
}

.archive-list::-webkit-scrollbar-track {
    background: transparent;
}

.archive-list::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 999px;
}

.archive-sidebar:hover .archive-list::-webkit-scrollbar-thumb,
.archive-list:focus-within::-webkit-scrollbar-thumb {
    background: var(--json-tool-archive-scrollbar);
}

.archive-sidebar:hover .archive-list::-webkit-scrollbar-thumb:hover,
.archive-list:focus-within::-webkit-scrollbar-thumb:hover {
    background: var(--json-tool-archive-scrollbar-hover);
}

.archive-item {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 0px;
    border-radius: 2px;
    cursor: pointer;
    font-size: 12px;
    color: var(--json-tool-text-muted);
    transition:
        color 0.12s ease,
        opacity 0.12s ease;
}

.archive-item:hover {
    background-color: var(--json-tool-archive-hover);
}

.archive-item.is-active {
    background-color: var(--json-tool-archive-active);
    color: var(--el-color-primary, #409eff);
}

.archive-item.is-active:hover {
    background-color: var(--json-tool-archive-active-hover);
}

.archive-item.is-active .archive-name {
    color: inherit;
}

.archive-item.drag-ready {
    background-color: var(--json-tool-archive-hover);
}

.archive-name {
    flex: 0 1 auto;
    display: block;
    max-width: 100%;
    min-width: 0;
    text-align: center;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    user-select: none;
}

.archive-item.dragging {
    opacity: 0.7;
    background-color: var(--json-tool-archive-drag);
}

.archive-item.drag-over {
    background-color: var(--json-tool-archive-hover);
}

.archive-drop-indicator {
    height: 2px;
    background: #409eff;
    margin: 2px 0;
    border-radius: 1px;
    pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
    .json-tool-root,
    .json-tool-container,
    .tool-bar,
    .editor-panel,
    .monaco-editor-container,
    .editor-status-bar,
    .archive-sidebar {
        transition: none !important;
        animation: none !important;
    }
}

/* ==================== Diff 模式样式（仅工具栏） ==================== */
/* 编辑区与同步按钮等样式已下沉至 JsonToolDiffPane.vue */
.diff-tool-bar {
    justify-content: flex-start;
}

.diff-nav-group {
    display: flex;
    align-items: center;
    margin-left: 12px;
}

.diff-nav-cluster {
    min-width: 280px;
    height: 32px;
    display: inline-grid;
    grid-template-columns: minmax(88px, auto) minmax(124px, auto) minmax(88px, auto);
    align-items: center;
    box-sizing: border-box;
    border: 1px solid var(--json-tool-diff-nav-border);
    border-radius: 4px;
    background: var(--json-tool-diff-nav-bg);
    color: var(--json-tool-diff-nav-text);
    overflow: hidden;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    transition: var(--json-tool-theme-transition);
}

.diff-nav-action {
    height: 100%;
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 0;
    background: transparent;
    color: inherit;
    font-size: 12px;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    font: inherit;
    transition: var(--json-tool-theme-transition);
}

.diff-nav-action + .diff-nav-status,
.diff-nav-status + .diff-nav-action {
    border-left: 1px solid var(--json-tool-diff-nav-divider);
}

.diff-nav-action:hover:not(:disabled) {
    background: var(--json-tool-diff-nav-action-hover);
}

.diff-nav-action:active:not(:disabled) {
    background: var(--json-tool-diff-nav-action-active);
}

.diff-nav-action:disabled {
    color: var(--json-tool-diff-nav-action-disabled);
    cursor: not-allowed;
}

.diff-nav-status {
    min-width: 124px;
    height: 100%;
    padding: 0 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--json-tool-diff-nav-status-bg);
    color: inherit;
    font-size: 12px;
    line-height: 1;
    white-space: nowrap;
    user-select: none;
    box-sizing: border-box;
}
</style>
