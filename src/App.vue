<template>
    <JsonToolWorkbench :locale="locale" @switch-locale="switchLocale" />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import JsonToolWorkbench from './components/JsonTool/JsonToolWorkbench.vue';

const LOCALE_KEY = 'json-tool-locale';
const readLocale = (): 'zh' | 'en' => {
    try {
        return localStorage.getItem(LOCALE_KEY) === 'en' ? 'en' : 'zh';
    } catch {
        return 'zh';
    }
};
const locale = ref<'zh' | 'en'>(readLocale());
const switchLocale = () => {
    locale.value = locale.value === 'zh' ? 'en' : 'zh';
};
watch(locale, (value) => {
    document.documentElement.lang = value === 'en' ? 'en' : 'zh-CN';
    document.title = value === 'en' ? 'Local JSON Tools' : 'JSON 本地工具';
    try {
        localStorage.setItem(LOCALE_KEY, value);
    } catch {
        // Language switching remains usable if storage is unavailable.
    }
}, { immediate: true });
</script>

