// 右键菜单注册：把 5 类菜单项 + 批量前后缀对话框的应用逻辑从 JsonTool.client.vue
// 抽出来，主文件通过依赖注入（ctx）的方式提供编辑器、状态 ref、共享工具函数。
//
// 这里只负责「调用 monaco editor.addAction 注册菜单」与「批量前后缀对话框的处理」，
// 不持有任何业务状态：所有 ref 都从 ctx 读，工具函数都从 ctx 调。
// 主文件保留：affix 对话框模板，并注入 jsonEngine 相关包装函数。

import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { ElMessageBox } from 'element-plus';
import type { Ref } from 'vue';

import type { SettingsTxt } from '../utils/i18n';
import { sortJsonArrayByCanonicalKey } from '../utils/jsonDiffSort';
import { sortStringLines, type SortMethod, type SortOrder } from '../utils/jsonSort';

type Base64Module = typeof import('js-base64');

let base64ModulePromise: Promise<Base64Module> | null = null;

const loadBase64Module = (): Promise<Base64Module> => {
    if (!base64ModulePromise) {
        base64ModulePromise = import('js-base64');
    }
    return base64ModulePromise;
};

export type AffixMode = 'none' | 'add' | 'remove';

export interface PreprocessJsonResult {
    data: any;
    escapeMap: Map<string, string>;
}

interface EditorSelectedSource {
    text: string;
    replaceRange: monaco.Range | null;
    isSelection: boolean;
}

export interface EditorContextMenuCtx {
    // i18n
    settingsTxt: Ref<SettingsTxt>;

    // 编辑器引用（用 getter 避免循环引用，主文件还没创建编辑器时 composable 也能初始化）
    getInputEditor: () => monaco.editor.IStandaloneCodeEditor | null;

    // 排序设置（与设置面板共用）
    sortMethod: Ref<SortMethod>;
    sortOrder: Ref<SortOrder>;

    // 批量前后缀对话框状态
    affix: {
        dialogVisible: Ref<boolean>;
        prefixMode: Ref<AffixMode>;
        suffixMode: Ref<AffixMode>;
        prefixValue: Ref<string>;
        suffixValue: Ref<string>;
    };

    // 通知
    showMessageSuccess: (msg: string) => void;
    showMessageWarning: (msg: string) => void;
    showMessageError: (msg: string) => void;

    // 共享工具：写出口与基础工具
    writeProcessingResultToOutput: (text: string, outputKind: 'json' | 'text') => boolean;
    getEditorSelectedOrFullSource: (editor: monaco.editor.IStandaloneCodeEditor) => EditorSelectedSource | null;
    transformLines: (raw: string, transform: (line: string) => string) => string;
    buildArrayFromTextLines: (raw: string) => string;
    preprocessJSON: (input: string, options?: { preserveNumberLiterals?: boolean; encodingMode?: boolean }) => PreprocessJsonResult;
    formatJsonValueForContextAction: (data: any, escapeMap?: Map<string, string>, compressed?: boolean) => string;
    dedupeSimpleArray: (arr: any[]) => any[];
    extractValuesByKey: (data: any, targetKey: string) => { values: any[]; skippedComplex: number };
    sendInputContentToDiff: (side: 'left' | 'right') => void | Promise<void>;
    sendContentToDiff: (side: 'left' | 'right', content: string, emptyMessage?: string) => void | Promise<void>;
    setInputSendToDiffContextKeys: (left: { set: (v: boolean) => void } | null, right: { set: (v: boolean) => void } | null) => void;
    getJsonPathAtPosition: (model: monaco.editor.ITextModel, position: monaco.Position) => string | null;
    copyToClipboard: (text: string) => void | Promise<void>;
}

interface MonacoContextMenuActionLike {
    id?: string;
    label?: string;
    class?: string;
    actions?: MonacoContextMenuActionLike[];
}

interface MonacoContextMenuContributionLike {
    _getMenuActions?: (model: monaco.editor.ITextModel, menuId: unknown) => MonacoContextMenuActionLike[];
    __jsonToolHiddenCommandIds?: string[];
}

export function useEditorContextMenu(ctx: EditorContextMenuCtx) {
    const {
        settingsTxt,
        sortMethod,
        sortOrder,
        affix,
        showMessageSuccess,
        showMessageWarning,
        showMessageError,
        writeProcessingResultToOutput,
        getEditorSelectedOrFullSource,
        transformLines,
        buildArrayFromTextLines,
        preprocessJSON,
        formatJsonValueForContextAction,
        dedupeSimpleArray,
        extractValuesByKey,
        sendInputContentToDiff,
        sendContentToDiff,
        setInputSendToDiffContextKeys,
        getJsonPathAtPosition,
        copyToClipboard,
    } = ctx;

    /**
     * 文本处理 + 数组处理：注册到普通模式 inputEditor 的右键菜单。
     * 数组组（4_array）：数组排序、数组去重、数组转文本行、按 key 提取 value
     * 文本组（5_text）：文本行排序、文本行去重、文本行转数组、去除空行、去除每行前后空格、批量添加 / 移除前后缀
     */
    const registerProcessingActions = (editor: monaco.editor.IStandaloneCodeEditor) => {
        const applyTextTransform = async (transform: (text: string) => Promise<string> | string, successMessage: string, outputKind: 'json' | 'text') => {
            const source = getEditorSelectedOrFullSource(editor);
            if (!source) return;
            if (!source.text.trim()) {
                showMessageError(settingsTxt.value.msgContextNoContent);
                return;
            }

            try {
                const nextText = await transform(source.text);
                if (!writeProcessingResultToOutput(nextText, outputKind)) return;
                showMessageSuccess(successMessage);
            } catch (error: any) {
                showMessageError(error?.message || settingsTxt.value.msgUnknownError);
            }
        };

        editor.addAction({
            id: 'json-tool-text-to-array',
            label: settingsTxt.value.ctxTextToArray,
            contextMenuGroupId: '5_text',
            contextMenuOrder: 3,
            run: () => applyTextTransform((text) => buildArrayFromTextLines(text), settingsTxt.value.msgTextToArraySuccess, 'json'),
        });

        editor.addAction({
            id: 'json-tool-batch-affix',
            label: settingsTxt.value.ctxBatchAffix,
            contextMenuGroupId: '5_text',
            contextMenuOrder: 6,
            run: () => {
                // 打开对话框前不预填上次的值，也不默认选择操作，避免误处理。
                affix.prefixMode.value = 'none';
                affix.suffixMode.value = 'none';
                affix.prefixValue.value = '';
                affix.suffixValue.value = '';
                affix.dialogVisible.value = true;
            },
        });

        editor.addAction({
            id: 'json-tool-remove-blank-lines',
            label: settingsTxt.value.ctxRemoveBlankLines,
            contextMenuGroupId: '5_text',
            contextMenuOrder: 4,
            run: () => {
                const source = getEditorSelectedOrFullSource(editor);
                if (!source) return;
                if (!source.text.trim()) {
                    showMessageError(settingsTxt.value.msgContextNoContent);
                    return;
                }

                try {
                    const lines = source.text.split(/\r?\n/);
                    // 仅整行为空（含纯空白）算作空行；保留尾部换行的空字符串本身不计入"被去除"。
                    const trailingEmpty = lines.length > 1 && lines[lines.length - 1] === '';
                    const body = trailingEmpty ? lines.slice(0, -1) : lines;
                    const kept = body.filter((line) => line.trim() !== '');
                    const removed = body.length - kept.length;
                    if (removed === 0) {
                        showMessageWarning(settingsTxt.value.msgRemoveBlankLinesNone);
                        return;
                    }
                    const nextText = kept.join('\n') + (trailingEmpty ? '\n' : '');
                    if (!writeProcessingResultToOutput(nextText, 'text')) return;
                    showMessageSuccess(settingsTxt.value.msgRemoveBlankLinesSuccess(removed));
                } catch (error: any) {
                    showMessageError(error?.message || settingsTxt.value.msgUnknownError);
                }
            },
        });

        editor.addAction({
            id: 'json-tool-trim-lines',
            label: settingsTxt.value.ctxTrimLines,
            contextMenuGroupId: '5_text',
            contextMenuOrder: 5,
            run: () => {
                const source = getEditorSelectedOrFullSource(editor);
                if (!source) return;
                if (!source.text.trim()) {
                    showMessageError(settingsTxt.value.msgContextNoContent);
                    return;
                }

                try {
                    const nextText = transformLines(source.text, (line) => line.trim());
                    if (nextText === source.text) {
                        showMessageWarning(settingsTxt.value.msgTrimLinesNone);
                        return;
                    }
                    if (!writeProcessingResultToOutput(nextText, 'text')) return;
                    showMessageSuccess(settingsTxt.value.msgTrimLinesSuccess);
                } catch (error: any) {
                    showMessageError(error?.message || settingsTxt.value.msgUnknownError);
                }
            },
        });

        editor.addAction({
            id: 'json-tool-line-sort',
            label: settingsTxt.value.ctxLineSort,
            contextMenuGroupId: '5_text',
            contextMenuOrder: 1,
            run: () => {
                const source = getEditorSelectedOrFullSource(editor);
                if (!source) return;
                if (!source.text.trim()) {
                    showMessageError(settingsTxt.value.msgContextNoContent);
                    return;
                }
                try {
                    // 复用设置面板里的"排序方式 / 方向"。当设置选的是"按字段"，
                    // 文本行没有字段概念，降级到 mixed：纯数字行按数值，其余按字典序，
                    // 升序时数字组在前、字符串组在后；降序则反过来。
                    const method: 'dictionary' | 'length' | 'mixed' = sortMethod.value === 'field' ? 'mixed' : sortMethod.value;
                    const sorted = sortStringLines(source.text, method, sortOrder.value);
                    if (!writeProcessingResultToOutput(sorted, 'text')) return;
                    showMessageSuccess(settingsTxt.value.msgLineSortSuccess);
                } catch (error: any) {
                    showMessageError(error?.message || settingsTxt.value.msgUnknownError);
                }
            },
        });

        editor.addAction({
            id: 'json-tool-line-dedupe',
            label: settingsTxt.value.ctxLineDedupe,
            contextMenuGroupId: '5_text',
            contextMenuOrder: 2,
            run: () => {
                const source = getEditorSelectedOrFullSource(editor);
                if (!source) return;
                if (!source.text.trim()) {
                    showMessageError(settingsTxt.value.msgContextNoContent);
                    return;
                }

                try {
                    // 保留首次出现的行；末尾换行产生的空字符串单独处理，避免破坏文本结尾。
                    const lines = source.text.split(/\r?\n/);
                    const trailingEmpty = lines.length > 1 && lines[lines.length - 1] === '';
                    const body = trailingEmpty ? lines.slice(0, -1) : lines;

                    const seen = new Set<string>();
                    const kept: string[] = [];
                    for (const line of body) {
                        if (seen.has(line)) continue;
                        seen.add(line);
                        kept.push(line);
                    }
                    const removed = body.length - kept.length;
                    if (removed === 0) {
                        showMessageWarning(settingsTxt.value.msgLineDedupeNone);
                        return;
                    }
                    const nextText = kept.join('\n') + (trailingEmpty ? '\n' : '');
                    if (!writeProcessingResultToOutput(nextText, 'text')) return;
                    showMessageSuccess(settingsTxt.value.msgLineDedupeSuccess(removed));
                } catch (error: any) {
                    showMessageError(error?.message || settingsTxt.value.msgUnknownError);
                }
            },
        });

        const parseJsonActionSource = (
            editor: monaco.editor.IStandaloneCodeEditor,
            shouldUseSelectedData: (data: any) => boolean,
        ): PreprocessJsonResult => {
            const source = getEditorSelectedOrFullSource(editor);
            if (!source) {
                throw new Error(settingsTxt.value.msgNoAvailableEditor);
            }
            if (!source.text.trim()) {
                throw new Error(settingsTxt.value.msgContextNoContent);
            }

            if (source.isSelection) {
                try {
                    const selectedResult = preprocessJSON(source.text, { preserveNumberLiterals: true });
                    if (shouldUseSelectedData(selectedResult.data)) {
                        return selectedResult;
                    }
                } catch {
                    // 选区可能只是双击字符串后的片段；结构类动作此时应回退到全文。
                }

                const model = editor.getModel();
                const fullText = model?.getValue() || '';
                if (!fullText.trim()) {
                    throw new Error(settingsTxt.value.msgContextNoContent);
                }
                return preprocessJSON(fullText, { preserveNumberLiterals: true });
            }

            return preprocessJSON(source.text, { preserveNumberLiterals: true });
        };

        const parseArrayActionSource = (editor: monaco.editor.IStandaloneCodeEditor): PreprocessJsonResult =>
            parseJsonActionSource(editor, (data) => Array.isArray(data));

        const formatArrayItemAsTextLine = (item: any, escapeMap: Map<string, string>): string => {
            if (item === null || item === undefined) return '';
            return formatJsonValueForContextAction(item, escapeMap, true);
        };

        const runArrayAction = async (handler: (array: any[], escapeMap: Map<string, string>) => { data: any; successMessage: string }) => {
            try {
                // 不再要求数组同质或仅含原始值；混合类型由各 handler 自行处理。
                const result = parseArrayActionSource(editor);
                if (!Array.isArray(result.data)) {
                    throw new Error(settingsTxt.value.msgArrayExpected);
                }
                const { data, successMessage } = handler(result.data, result.escapeMap);
                const nextText = formatJsonValueForContextAction(data, result.escapeMap);
                if (!writeProcessingResultToOutput(nextText, 'json')) return;
                showMessageSuccess(successMessage);
            } catch (error: any) {
                showMessageError(error?.message || settingsTxt.value.msgUnknownError);
            }
        };

        editor.addAction({
            id: 'json-tool-array-sort',
            label: settingsTxt.value.ctxArraySort,
            contextMenuGroupId: '4_array',
            contextMenuOrder: 1,
            run: async () =>
                runArrayAction((array) => {
                    const sorted = sortJsonArrayByCanonicalKey(array, sortOrder.value);
                    const orderText = sortOrder.value === 'asc' ? settingsTxt.value.sortOrderAsc : settingsTxt.value.sortOrderDesc;
                    return {
                        data: sorted,
                        successMessage: settingsTxt.value.msgArraySortSuccess(orderText),
                    };
                }),
        });

        editor.addAction({
            id: 'json-tool-array-dedupe',
            label: settingsTxt.value.ctxArrayDedupe,
            contextMenuGroupId: '4_array',
            contextMenuOrder: 2,
            run: async () =>
                runArrayAction((array) => ({
                    data: dedupeSimpleArray(array),
                    successMessage: settingsTxt.value.msgArrayDedupeSuccess,
                })),
        });

        editor.addAction({
            id: 'json-tool-array-to-text',
            label: settingsTxt.value.ctxArrayToText,
            contextMenuGroupId: '4_array',
            contextMenuOrder: 3,
            run: () => {
                try {
                    const result = parseArrayActionSource(editor);
                    if (!Array.isArray(result.data)) {
                        throw new Error(settingsTxt.value.msgArrayExpected);
                    }
                    // 数组每项变一行：字符串输出为 JSON 字符串字面量，null 输出空字符串；
                    // 其他值使用项目 JSON formatter 紧凑序列化。
                    const lines = result.data.map((item: any) => formatArrayItemAsTextLine(item, result.escapeMap));
                    const nextText = lines.join('\n');
                    if (!writeProcessingResultToOutput(nextText, 'text')) return;
                    showMessageSuccess(settingsTxt.value.msgArrayToTextSuccess(lines.length));
                } catch (error: any) {
                    showMessageError(error?.message || settingsTxt.value.msgUnknownError);
                }
            },
        });

        editor.addAction({
            id: 'json-tool-extract-values-by-key',
            label: settingsTxt.value.ctxExtractValuesByKey,
            contextMenuGroupId: '4_array',
            contextMenuOrder: 4,
            run: async () => {
                const source = getEditorSelectedOrFullSource(editor);
                if (!source) return;
                if (!source.text.trim()) {
                    showMessageError(settingsTxt.value.msgContextNoContent);
                    return;
                }

                // 先解析 JSON：如果连解析都失败，没必要再让用户输入 key。
                let parsed: any;
                let escapeMap: Map<string, string>;
                try {
                    const result = parseJsonActionSource(editor, (data) => data !== null && typeof data === 'object');
                    parsed = result.data;
                    escapeMap = result.escapeMap;
                } catch (error: any) {
                    showMessageError(error?.message || settingsTxt.value.msgUnknownError);
                    return;
                }

                // 弹窗让用户输入要提取的 key 名。
                let targetKey = '';
                try {
                    const { value } = (await ElMessageBox.prompt(
                        settingsTxt.value.promptExtractValuesByKeyMessage,
                        settingsTxt.value.promptExtractValuesByKeyTitle,
                        {
                            confirmButtonText: settingsTxt.value.btnConfirm,
                            cancelButtonText: settingsTxt.value.btnCancel,
                            inputPlaceholder: settingsTxt.value.promptExtractValuesByKeyPlaceholder,
                            inputValidator: (input: string) => (input && input.trim().length > 0 ? true : settingsTxt.value.promptExtractValuesByKeyEmpty),
                        },
                    )) as { value: string };
                    targetKey = (value || '').trim();
                } catch {
                    // 用户取消
                    return;
                }
                if (!targetKey) return;

                try {
                    const { values, skippedComplex } = extractValuesByKey(parsed, targetKey);
                    if (values.length === 0 && skippedComplex === 0) {
                        showMessageWarning(settingsTxt.value.msgExtractValuesByKeyNotFound(targetKey));
                        return;
                    }
                    if (values.length === 0 && skippedComplex > 0) {
                        showMessageWarning(settingsTxt.value.msgExtractValuesByKeyAllComplex(targetKey, skippedComplex));
                        return;
                    }
                    const nextText = formatJsonValueForContextAction(values, escapeMap);
                    if (!writeProcessingResultToOutput(nextText, 'json')) return;
                    if (skippedComplex > 0) {
                        showMessageSuccess(settingsTxt.value.msgExtractValuesByKeyPartial(values.length, skippedComplex));
                    } else {
                        showMessageSuccess(settingsTxt.value.msgExtractValuesByKeySuccess(values.length));
                    }
                } catch (error: any) {
                    showMessageError(error?.message || settingsTxt.value.msgUnknownError);
                }
            },
        });
    };

    /**
     * 批量加 / 去前后缀对话框的应用按钮处理：
     * 前缀和后缀两组互不影响；同组内 add/remove 互斥（UI 层已保证）。
     * 仅作用于普通模式下的 inputEditor，结果写入预览区。
     */
    const applyBatchAffix = () => {
        const prefixMode = affix.prefixMode.value;
        const suffixMode = affix.suffixMode.value;
        const prefix = affix.prefixValue.value;
        const suffix = affix.suffixValue.value;
        const hasPrefixOperation = prefixMode !== 'none' && prefix !== '';
        const hasSuffixOperation = suffixMode !== 'none' && suffix !== '';

        if (!hasPrefixOperation && !hasSuffixOperation) {
            affix.dialogVisible.value = false;
            return;
        }

        const inputEditor = ctx.getInputEditor();
        if (!inputEditor) {
            showMessageError(settingsTxt.value.msgNoAvailableEditor);
            return;
        }
        const source = getEditorSelectedOrFullSource(inputEditor);
        if (!source || !source.text.trim()) {
            showMessageError(settingsTxt.value.msgContextNoContent);
            return;
        }

        try {
            const result = transformLines(source.text, (line) => {
                let next = line;
                if (hasPrefixOperation && prefixMode === 'add') next = prefix + next;
                else if (hasPrefixOperation && prefixMode === 'remove' && next.startsWith(prefix)) next = next.slice(prefix.length);
                if (hasSuffixOperation && suffixMode === 'add') next = next + suffix;
                else if (hasSuffixOperation && suffixMode === 'remove' && next.endsWith(suffix)) next = next.slice(0, -suffix.length);
                return next;
            });
            if (!writeProcessingResultToOutput(result, 'text')) return;
            showMessageSuccess(settingsTxt.value.msgAffixApplied);
            affix.dialogVisible.value = false;
        } catch (error: any) {
            showMessageError(error?.message || settingsTxt.value.msgUnknownError);
        }
    };

    /**
     * 「发送当前内容到 Diff 左 / 右」两项菜单：仅在普通模式 inputEditor 注册。
     * 仅在目标 diff 草稿为空时展示对应菜单项，避免覆盖已有对比内容。
     * ContextKey 只依赖 diff 草稿状态，不读取输入区全文，避免大文件编辑卡顿。
     */
    const registerInputDiffTransferActions = (editor: monaco.editor.IStandaloneCodeEditor) => {
        const leftKey = editor.createContextKey<boolean>('jsonToolCanSendToDiffLeft', false);
        const rightKey = editor.createContextKey<boolean>('jsonToolCanSendToDiffRight', false);
        setInputSendToDiffContextKeys(leftKey as any, rightKey as any);

        editor.addAction({
            id: 'json-tool-send-to-diff-left',
            label: settingsTxt.value.ctxSendToDiffLeft,
            contextMenuGroupId: '2_diff',
            contextMenuOrder: 1,
            precondition: 'jsonToolCanSendToDiffLeft',
            run: () => sendInputContentToDiff('left'),
        });

        editor.addAction({
            id: 'json-tool-send-to-diff-right',
            label: settingsTxt.value.ctxSendToDiffRight,
            contextMenuGroupId: '2_diff',
            contextMenuOrder: 2,
            precondition: 'jsonToolCanSendToDiffRight',
            run: () => sendInputContentToDiff('right'),
        });
    };

    const registerOutputDiffTransferActions = (editor: monaco.editor.IStandaloneCodeEditor) => {
        const leftKey = editor.createContextKey<boolean>('jsonToolCanSendToDiffLeft', false);
        const rightKey = editor.createContextKey<boolean>('jsonToolCanSendToDiffRight', false);
        setInputSendToDiffContextKeys(leftKey as any, rightKey as any);

        editor.addAction({
            id: 'json-tool-output-send-to-diff-left',
            label: settingsTxt.value.ctxSendToDiffLeft,
            contextMenuGroupId: '2_diff',
            contextMenuOrder: 1,
            precondition: 'jsonToolCanSendToDiffLeft',
            run: (ed) => sendContentToDiff('left', ed.getValue(), settingsTxt.value.msgTransferOutputEmpty),
        });

        editor.addAction({
            id: 'json-tool-output-send-to-diff-right',
            label: settingsTxt.value.ctxSendToDiffRight,
            contextMenuGroupId: '2_diff',
            contextMenuOrder: 2,
            precondition: 'jsonToolCanSendToDiffRight',
            run: (ed) => sendContentToDiff('right', ed.getValue(), settingsTxt.value.msgTransferOutputEmpty),
        });
    };

    /**
     * 注册始终显示的剪贴板菜单项，文案走本地 i18n；
     * 实际执行仍复用 Monaco 内置 cut/copy/paste 命令，避免重复维护浏览器兼容细节。
     */
    const registerClipboardActions = (editor: monaco.editor.IStandaloneCodeEditor) => {
        const runClipboardCommand = (commandId: string) => {
            editor.focus();
            editor.trigger('json-tool-context-menu', commandId, null);
        };

        editor.addAction({
            id: 'json-tool-cut',
            label: settingsTxt.value.ctxCut,
            contextMenuGroupId: '1_clipboard',
            contextMenuOrder: 1,
            run: () => runClipboardCommand('editor.action.clipboardCutAction'),
        });

        editor.addAction({
            id: 'json-tool-copy',
            label: settingsTxt.value.ctxCopy,
            contextMenuGroupId: '1_clipboard',
            contextMenuOrder: 2,
            run: () => runClipboardCommand('editor.action.clipboardCopyAction'),
        });

        editor.addAction({
            id: 'json-tool-copy-path',
            label: settingsTxt.value.ctxCopyPath,
            contextMenuGroupId: '1_clipboard',
            contextMenuOrder: 2.5,
            run: async (ed) => {
                const model = ed.getModel();
                const position = ed.getPosition();
                if (!model || !position) return;

                if (model.getLanguageId() !== 'json') {
                    showMessageError(settingsTxt.value.msgCopyPathJsonOnly);
                    return;
                }

                const path = getJsonPathAtPosition(model, position);
                if (!path) {
                    showMessageError(settingsTxt.value.msgCopyPathUnavailable);
                    return;
                }

                await copyToClipboard(path);
                showMessageSuccess(settingsTxt.value.msgCopyPathSuccess);
            },
        });

        editor.addAction({
            id: 'json-tool-paste',
            label: settingsTxt.value.ctxPaste,
            contextMenuGroupId: '1_clipboard',
            contextMenuOrder: 3,
            run: () => runClipboardCommand('editor.action.clipboardPasteAction'),
        });
    };

    const registerReadonlyClipboardActions = (editor: monaco.editor.IStandaloneCodeEditor) => {
        const runClipboardCommand = (commandId: string) => {
            editor.focus();
            editor.trigger('json-tool-context-menu', commandId, null);
        };

        editor.addAction({
            id: 'json-tool-readonly-copy',
            label: settingsTxt.value.ctxCopy,
            contextMenuGroupId: '1_clipboard',
            contextMenuOrder: 1,
            run: () => runClipboardCommand('editor.action.clipboardCopyAction'),
        });

        editor.addAction({
            id: 'json-tool-readonly-copy-path',
            label: settingsTxt.value.ctxCopyPath,
            contextMenuGroupId: '1_clipboard',
            contextMenuOrder: 2,
            run: async (ed) => {
                const model = ed.getModel();
                const position = ed.getPosition();
                if (!model || !position) return;

                if (model.getLanguageId() !== 'json') {
                    showMessageError(settingsTxt.value.msgCopyPathJsonOnly);
                    return;
                }

                const path = getJsonPathAtPosition(model, position);
                if (!path) {
                    showMessageError(settingsTxt.value.msgCopyPathUnavailable);
                    return;
                }

                await copyToClipboard(path);
                showMessageSuccess(settingsTxt.value.msgCopyPathSuccess);
            },
        });
    };

    /**
     * 给编辑器注册「Base64 编解码 / URL 编解码」四个右键菜单 action。
     * 普通模式与 Diff 模式（左右两个 Monaco）共用此函数，
     * 文案使用 settingsTxt 计算属性，自动根据 props.locale 切换中英文。
     */
    const registerEncodingActions = (editor: monaco.editor.IStandaloneCodeEditor) => {
        editor.addAction({
            id: 'base64-encode',
            label: settingsTxt.value.ctxBase64Encode,
            contextMenuGroupId: '3_encoding',
            contextMenuOrder: 1,
            precondition: 'editorHasSelection',
            run: async (ed) => {
                const selection = ed.getSelection();
                if (!selection) return;
                const model = ed.getModel();
                if (!model) return;
                const selectedText = model.getValueInRange(selection);
                if (!selectedText) return;
                try {
                    const { Base64 } = await loadBase64Module();
                    const encoded = Base64.encode(selectedText);
                    ed.executeEdits('base64-encode', [{ range: selection, text: encoded }]);
                    showMessageSuccess(settingsTxt.value.msgBase64EncodeOk);
                } catch {
                    showMessageError(settingsTxt.value.msgBase64EncodeFail);
                }
            },
        });

        editor.addAction({
            id: 'base64-decode',
            label: settingsTxt.value.ctxBase64Decode,
            contextMenuGroupId: '3_encoding',
            contextMenuOrder: 2,
            precondition: 'editorHasSelection',
            run: async (ed) => {
                const selection = ed.getSelection();
                if (!selection) return;
                const model = ed.getModel();
                if (!model) return;
                const selectedText = model.getValueInRange(selection);
                if (!selectedText) return;
                try {
                    const { Base64 } = await loadBase64Module();
                    const decoded = Base64.decode(selectedText);
                    ed.executeEdits('base64-decode', [{ range: selection, text: decoded }]);
                    showMessageSuccess(settingsTxt.value.msgBase64DecodeOk);
                } catch {
                    showMessageError(settingsTxt.value.msgBase64DecodeFail);
                }
            },
        });

        editor.addAction({
            id: 'url-encode',
            label: settingsTxt.value.ctxUrlEncode,
            contextMenuGroupId: '3_encoding',
            contextMenuOrder: 3,
            precondition: 'editorHasSelection',
            run: (ed) => {
                const selection = ed.getSelection();
                if (!selection) return;
                const model = ed.getModel();
                if (!model) return;
                const selectedText = model.getValueInRange(selection);
                if (!selectedText) return;
                try {
                    const encoded = encodeURIComponent(selectedText);
                    ed.executeEdits('url-encode', [{ range: selection, text: encoded }]);
                    showMessageSuccess(settingsTxt.value.msgUrlEncodeOk);
                } catch {
                    showMessageError(settingsTxt.value.msgUrlEncodeFail);
                }
            },
        });

        editor.addAction({
            id: 'url-decode',
            label: settingsTxt.value.ctxUrlDecode,
            contextMenuGroupId: '3_encoding',
            contextMenuOrder: 4,
            precondition: 'editorHasSelection',
            run: (ed) => {
                const selection = ed.getSelection();
                if (!selection) return;
                const model = ed.getModel();
                if (!model) return;
                const selectedText = model.getValueInRange(selection);
                if (!selectedText) return;
                try {
                    const decoded = decodeURIComponent(selectedText);
                    ed.executeEdits('url-decode', [{ range: selection, text: decoded }]);
                    showMessageSuccess(settingsTxt.value.msgUrlDecodeOk);
                } catch {
                    showMessageError(settingsTxt.value.msgUrlDecodeFail);
                }
            },
        });
    };

    /**
     * Monaco 暂无公开 API 可按命令 id 隐藏单个内置右键菜单项，
     * 这里在 editor 实例级别包装私有 _getMenuActions，仅过滤指定命令。
     */
    const filterBuiltinContextMenuActions = (editor: monaco.editor.IStandaloneCodeEditor, hiddenCommandIds: string[]) => {
        if (hiddenCommandIds.length === 0) return;

        const contribution = editor.getContribution('editor.contrib.contextmenu') as MonacoContextMenuContributionLike | null;
        if (!contribution || typeof contribution._getMenuActions !== 'function') return;

        const nextHiddenIds = Array.from(new Set([...(contribution.__jsonToolHiddenCommandIds ?? []), ...hiddenCommandIds]));
        if (
            contribution.__jsonToolHiddenCommandIds &&
            nextHiddenIds.length === contribution.__jsonToolHiddenCommandIds.length &&
            nextHiddenIds.every((id) => contribution.__jsonToolHiddenCommandIds?.includes(id))
        ) {
            return;
        }

        const originalGetMenuActions = contribution._getMenuActions.bind(contribution);
        contribution.__jsonToolHiddenCommandIds = nextHiddenIds;

        const isSeparator = (action: MonacoContextMenuActionLike) => action.class === 'separator' || action.label === '';

        const trimSeparators = (actions: MonacoContextMenuActionLike[]) => {
            const trimmed: MonacoContextMenuActionLike[] = [];

            actions.forEach((action) => {
                if (isSeparator(action)) {
                    if (trimmed.length === 0 || isSeparator(trimmed[trimmed.length - 1])) {
                        return;
                    }
                }
                trimmed.push(action);
            });

            while (trimmed.length > 0 && isSeparator(trimmed[trimmed.length - 1])) {
                trimmed.pop();
            }

            return trimmed;
        };

        const filterActions = (actions: MonacoContextMenuActionLike[]): MonacoContextMenuActionLike[] => {
            const filtered = actions
                .filter((action) => !nextHiddenIds.includes(action.id ?? ''))
                .map((action) => {
                    if (!action.actions) return action;
                    return {
                        ...action,
                        actions: filterActions(action.actions),
                    };
                });

            return trimSeparators(filtered);
        };

        contribution._getMenuActions = (model, menuId) => filterActions(originalGetMenuActions(model, menuId));
    };

    return {
        registerProcessingActions,
        registerInputDiffTransferActions,
        registerOutputDiffTransferActions,
        registerClipboardActions,
        registerReadonlyClipboardActions,
        registerEncodingActions,
        filterBuiltinContextMenuActions,
        applyBatchAffix,
    };
}
