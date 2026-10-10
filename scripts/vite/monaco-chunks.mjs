/**
 * 保持 Monaco 核心跨业务版本复用；语言模式和分词器仍由动态 import 加载。
 * Vite 的预加载辅助函数也独立存放，避免核心 chunk 引用变化频繁的 Nuxt 入口。
 * @param {string} id
 * @returns {string | undefined}
 */
export const getJsonToolManualChunk = (id) => {
    const normalized = id.replaceAll('\\', '/');
    if (normalized.includes('vite/preload-helper') || normalized.includes('commonjsHelpers')) {
        return 'module-runtime';
    }
    if (!normalized.includes('/monaco-editor/')) return undefined;
    if (normalized.includes('/vs/basic-languages/')) return undefined;
    if (normalized.includes('/vs/language/json/') && !normalized.includes('/monaco.contribution')) return undefined;
    return 'monaco-core';
};
