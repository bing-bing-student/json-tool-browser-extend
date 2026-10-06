import type { Ref } from 'vue';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import {
    defineJsonToolMonacoThemes,
    getJsonToolThemeForLanguage,
    type JsonToolThemeMode,
} from '../utils/monacoThemes';

/**
 * 集中管理 JSON 工具的 Monaco Worker、主题与可选语言贡献。
 * themeMode 是当前明暗主题；返回值提供环境初始化、语言注册与按需加载能力。
 */
export const useMonacoLanguageRegistry = (themeMode: Ref<JsonToolThemeMode>) => {
    const registeredLanguages = new Set<string>();
    let goContributionPromise: Promise<unknown> | null = null;
    let typescriptContributionPromise: Promise<unknown> | null = null;

    const registerYamlLanguage = () => {
        if (registeredLanguages.has('yaml')) return;
        registeredLanguages.add('yaml');
        monaco.languages.register({ id: 'yaml' });
        monaco.languages.setMonarchTokensProvider('yaml', {
            tokenizer: {
                root: [
                    [/\s+/, 'white'],
                    [/#.*$/, 'comment'],
                    [/^(\s*)(-\s)/, ['', 'keyword']],
                    [/^(\s*)([A-Za-z0-9_\-."'\[\]]+)(\s*:\s*)/, ['', 'type', 'delimiter']],
                    [/\b(true|false|yes|no|on|off|null|~)\b/i, 'keyword'],
                    [/[|>](?=\s|$)/, 'string'],
                    [/"([^"\\]|\\.)*"/, 'string'],
                    [/'([^'\\]|\\.)*'/, 'string'],
                    [/\b-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?\b/, 'number'],
                    [/[:{}\[\],&*?]/, 'delimiter'],
                ],
            },
        });
    };

    const registerXmlLanguage = () => {
        if (registeredLanguages.has('xml')) return;
        registeredLanguages.add('xml');
        monaco.languages.register({ id: 'xml' });
        monaco.languages.setMonarchTokensProvider('xml', {
            tokenizer: {
                root: [
                    [/<!--/, 'comment', '@comment'],
                    [/<\?xml/, 'metatag', '@processing'],
                    [/<\/?[\w:\-.]+/, 'tag', '@tag'],
                    [/[^<]+/, ''],
                ],
                comment: [
                    [/-->/, 'comment', '@pop'],
                    [/[^-]+/, 'comment'],
                    [/-/, 'comment'],
                ],
                processing: [
                    [/\?>/, 'metatag', '@pop'],
                    [/[^\?]+/, 'metatag'],
                    [/\?/, 'metatag'],
                ],
                tag: [
                    [/\s+/, 'white'],
                    [/[\w:\-.]+(?=\s*=)/, 'attribute.name'],
                    [/=/, 'delimiter'],
                    [/"[^"]*"/, 'attribute.value'],
                    [/'[^']*'/, 'attribute.value'],
                    [/\/?>/, 'tag', '@pop'],
                ],
            },
        });
    };

    const registerHtmlLanguage = () => {
        if (registeredLanguages.has('html')) return;
        registeredLanguages.add('html');
        monaco.languages.register({ id: 'html' });
        monaco.languages.setMonarchTokensProvider('html', {
            tokenizer: {
                root: [
                    [/<!--/, 'comment', '@comment'],
                    [/<\!DOCTYPE/, 'metatag', '@doctype'],
                    [/<\/?[\w:-]+/, 'tag', '@tag'],
                    [/[^<]+/, ''],
                ],
                comment: [
                    [/-->/, 'comment', '@pop'],
                    [/[^-]+/, 'comment'],
                    [/-/, 'comment'],
                ],
                doctype: [
                    [/>/, 'metatag', '@pop'],
                    [/[^>]+/, 'metatag'],
                ],
                tag: [
                    [/\s+/, 'white'],
                    [/[\w:-]+(?=\s*=)/, 'attribute.name'],
                    [/=/, 'delimiter'],
                    [/"[^"]*"/, 'attribute.value'],
                    [/'[^']*'/, 'attribute.value'],
                    [/\/?>/, 'tag', '@pop'],
                ],
            },
        });
    };

    const registerCssLanguage = () => {
        if (registeredLanguages.has('css')) return;
        registeredLanguages.add('css');
        monaco.languages.register({ id: 'css' });
        monaco.languages.setMonarchTokensProvider('css', {
            tokenizer: {
                root: [
                    [/\s+/, 'white'],
                    [/\/\*/, 'comment', '@comment'],
                    [/@[a-z-]+/i, 'keyword'],
                    [/[.#]?[a-zA-Z_][\w-]*(?=\s*[\{,])/, 'tag'],
                    [/\{/, 'delimiter.bracket', '@rulebody'],
                ],
                comment: [
                    [/\*\//, 'comment', '@pop'],
                    [/[^*]+/, 'comment'],
                    [/\*/, 'comment'],
                ],
                rulebody: [
                    [/\s+/, 'white'],
                    [/\/\*/, 'comment', '@comment'],
                    [/[a-z-]+(?=\s*:)/i, 'attribute.name'],
                    [/:/, 'delimiter'],
                    [/"[^"]*"/, 'string'],
                    [/'[^']*'/, 'string'],
                    [/#{0,1}[0-9a-fA-F]{3,8}\b/, 'number.hex'],
                    [/-?\d+(\.\d+)?(px|em|rem|%|vh|vw|s|ms|deg)?\b/, 'number'],
                    [/[a-z-]+\(/i, 'keyword'],
                    [/;/, 'delimiter'],
                    [/\}/, 'delimiter.bracket', '@pop'],
                ],
            },
        });
    };

    const registerTomlLanguage = () => {
        if (registeredLanguages.has('toml')) return;
        registeredLanguages.add('toml');
        monaco.languages.register({ id: 'toml' });
        monaco.languages.setMonarchTokensProvider('toml', {
            tokenizer: {
                root: [
                    [/#.*$/, 'comment'],
                    [/^\s*\[.+?\]\s*$/, 'type.identifier'],
                    [/^\s*\[\[.+?\]\]\s*$/, 'type.identifier'],
                    [/\b(true|false)\b/, 'keyword'],
                    [/\b\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?\b/, 'string.date'],
                    [/\[/, { token: 'delimiter.bracket', next: '@inline_array' }],
                    [/^[a-zA-Z_][a-zA-Z0-9_\-]*/, 'variable'],
                    [/=/, 'delimiter'],
                    [/"[^"\\]*(?:\\.[^"\\]*)*"/, 'string'],
                    [/-?\d+\.?\d*([eE][+-]?\d+)?/, 'number'],
                ],
                inline_array: [
                    [/\]/, { token: 'delimiter.bracket', next: '@pop' }],
                    [/,/, 'delimiter'],
                    [/"[^"\\]*(?:\\.[^"\\]*)*"/, 'string'],
                    [/-?\d+\.?\d*([eE][+-]?\d+)?/, 'number'],
                    [/\b(true|false)\b/, 'keyword'],
                    [/\s+/, 'white'],
                ],
            },
        });
    };

    /** 注册项目自定义的轻量语言分词器；language 是 Monaco 语言 ID，无返回值。 */
    const ensureMonacoLanguageRegistered = (language: string): void => {
        switch (language) {
            case 'yaml':
                registerYamlLanguage();
                break;
            case 'xml':
                registerXmlLanguage();
                break;
            case 'html':
                registerHtmlLanguage();
                break;
            case 'css':
                registerCssLanguage();
                break;
            case 'toml':
                registerTomlLanguage();
                break;
        }
    };

    /** 按语言动态加载 Monaco 官方贡献；language 是语言 ID，Promise 在贡献可用后完成。 */
    const loadMonacoLanguageContribution = async (language: string): Promise<void> => {
        ensureMonacoLanguageRegistered(language);
        if (language === 'go') {
            if (!goContributionPromise) {
                goContributionPromise = import('monaco-editor/esm/vs/basic-languages/go/go.contribution');
            }
            await goContributionPromise;
        } else if (language === 'typescript') {
            if (!typescriptContributionPromise) {
                typescriptContributionPromise = import('monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution');
            }
            await typescriptContributionPromise;
        }
    };

    /** 初始化 Monaco 的 Worker 路由和项目主题，无输入参数与返回值。 */
    const initializeMonacoEnvironment = (): void => {
        if (typeof window === 'undefined') return;
        window.MonacoEnvironment = {
            getWorker(_, label): Worker {
                if (label === 'json') return new jsonWorker();
                return new editorWorker();
            },
        };

        defineJsonToolMonacoThemes(monaco);
        monaco.editor.setTheme(getJsonToolThemeForLanguage('json', themeMode.value));
    };

    return {
        ensureMonacoLanguageRegistered,
        loadMonacoLanguageContribution,
        initializeMonacoEnvironment,
    };
};
