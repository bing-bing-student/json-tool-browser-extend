import { computed, nextTick, onMounted, ref, type Ref } from 'vue';
import { getFirstUseSampleJson, type JsonToolSampleLocale } from '../utils/firstUseSampleJson';

const FIRST_USE_GUIDE_STORAGE_KEY = 'json-tool:first-use-guide-dismissed:v1';

interface FirstUseGuideEditor {
    setValue(value: string): void;
    focus(): void;
}

interface UseJsonToolFirstUseGuideOptions {
    locale: Readonly<Ref<JsonToolSampleLocale | undefined>>;
    editorsInitialized: Readonly<Ref<boolean>>;
    isDiffMode: Readonly<Ref<boolean>>;
    isInputDragActive: Readonly<Ref<boolean>>;
    getInputEditor: () => FirstUseGuideEditor | null | undefined;
    showEditorNotInitError: () => void;
    formatJson: () => void;
}

export const useJsonToolFirstUseGuide = (options: UseJsonToolFirstUseGuideOptions) => {
    const isFirstUseGuideDismissed = ref(true);
    const inputHasContent = ref(false);

    const shouldShowFirstUseGuide = computed(
        () =>
            options.editorsInitialized.value &&
            !options.isDiffMode.value &&
            !isFirstUseGuideDismissed.value &&
            !inputHasContent.value &&
            !options.isInputDragActive.value,
    );

    const loadFirstUseGuideState = () => {
        if (typeof window === 'undefined') return;
        try {
            isFirstUseGuideDismissed.value = window.localStorage.getItem(FIRST_USE_GUIDE_STORAGE_KEY) === '1';
        } catch {
            isFirstUseGuideDismissed.value = true;
        }
    };

    const rememberFirstUseGuideDismissed = () => {
        isFirstUseGuideDismissed.value = true;
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(FIRST_USE_GUIDE_STORAGE_KEY, '1');
        } catch {
            /* ignore */
        }
    };

    const dismissFirstUseGuide = () => {
        rememberFirstUseGuideDismissed();
    };

    const loadFirstUseSample = () => {
        const inputEditor = options.getInputEditor();
        if (!inputEditor) {
            options.showEditorNotInitError();
            return;
        }

        rememberFirstUseGuideDismissed();
        inputEditor.setValue(getFirstUseSampleJson(options.locale.value));
        inputHasContent.value = true;
        inputEditor.focus();
        nextTick(() => {
            options.formatJson();
        });
    };

    onMounted(() => {
        loadFirstUseGuideState();
    });

    return {
        inputHasContent,
        shouldShowFirstUseGuide,
        dismissFirstUseGuide,
        loadFirstUseSample,
    };
};
