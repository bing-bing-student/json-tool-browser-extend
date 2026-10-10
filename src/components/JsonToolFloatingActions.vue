<template>
    <div ref="root" class="floating-actions" :class="{ 'is-dragging': dragging, 'is-left': position.side === 'left', 'is-ready': ready, 'is-open': open }" :style="rootStyle">
        <button
            ref="trigger"
            type="button"
            class="floating-trigger"
            :aria-expanded="open"
            :aria-label="txt.title"
            :inert="open"
            :tabindex="open ? -1 : 0"
            aria-controls="json-tool-floating-panel"
            :title="txt.dragHint"
            @click="togglePanel"
            @pointerdown="startDrag"
            @pointermove="moveDrag"
            @pointerup="finishDrag"
            @pointercancel="cancelDrag"
            @lostpointercapture="cancelDrag">
            <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" />
                <rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" />
            </svg>
        </button>

        <section id="json-tool-floating-panel" ref="panel" class="floating-panel" :aria-label="txt.title" :inert="!open" tabindex="-1">
            <button type="button" class="panel-action compact-action" :aria-label="txt.switchLanguage" @click="runAction()">
                <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h12M9 3v2M6 5c0 5 4 8 7 9M12 5c0 5-4 8-7 9M13 21l4-10 4 10M15 17h4" /></svg>
                <span class="action-copy">{{ txt.language }}</span><span class="action-value">{{ txt.languageTarget }}</span>
            </button>
            <button type="button" class="panel-action compact-action" :aria-label="txt.switchTheme" @click="emit('toggle-theme')">
                <svg v-if="themeMode === 'dark'" class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 14.45A7.65 7.65 0 0 1 9.55 3.8 8.2 8.2 0 1 0 20.2 14.45Z" /></svg>
                <svg v-else class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></svg>
                <span class="action-copy">{{ txt.theme }}</span><span class="action-value">{{ themeMode === 'dark' ? txt.dark : txt.light }}</span>
            </button>
        </section>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
    clampPosition, DEFAULT_FLOATING_ACTIONS_POSITION, FLOATING_ACTIONS_STORAGE_KEY,
    FLOATING_ACTIONS_VERTICAL_MARGIN, FLOATING_ACTIONS_HORIZONTAL_MARGIN,
    getDockedPosition, getExpandedPosition, getReleasedPosition, restoreFloatingActionsPosition,
} from './utils/floatingActionsPosition';

const props = defineProps<{ locale?: 'zh' | 'en'; themeMode: 'light' | 'dark'; dialogOpen?: boolean }>();
const emit = defineEmits<{ 'toggle-theme': []; 'switch-locale': [] }>();
const txt = computed(() => props.locale === 'en' ? {
    title: 'Language & Theme', dragHint: 'Click to open. Drag to either edge.',
    language: 'Language', languageTarget: '中文', switchLanguage: 'Switch to Chinese',
    theme: 'Theme', dark: 'Dark', light: 'Light', switchTheme: props.themeMode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
} : {
    title: '语言与主题', dragHint: '点击展开，拖动可调整位置并贴边',
    language: '语言', languageTarget: 'English', switchLanguage: '切换到 English',
    theme: '主题', dark: '深色', light: '浅色', switchTheme: props.themeMode === 'dark' ? '切换至浅色主题' : '切换至深色主题',
});

const root = ref<HTMLElement>();
const trigger = ref<HTMLButtonElement>();
const panel = ref<HTMLElement>();
const open = ref(false);
const dragging = ref(false);
const ready = ref(false);
const position = ref({ ...DEFAULT_FLOATING_ACTIONS_POSITION });
const viewport = ref({ width: 0, height: 0 });
const ICON_SIZE = 32;
const PANEL_WIDTH = 280;
const panelHeight = ref(120);
const dragPosition = ref({ x: 0, y: 0 });
const docked = computed(() => getDockedPosition(position.value, viewport.value.width, viewport.value.height, ICON_SIZE, ICON_SIZE));
const current = computed(() => dragging.value ? dragPosition.value : docked.value);
const expanded = computed(() => getExpandedPosition(docked.value, position.value.side, viewport.value.height, ICON_SIZE, PANEL_WIDTH, panelHeight.value));
const rootStyle = computed(() => {
    const point = open.value ? expanded.value : current.value;
    return {
        '--floating-actions-vertical-margin': `${FLOATING_ACTIONS_VERTICAL_MARGIN}px`,
        transform: `translate3d(${point.x}px, ${point.y}px, 0)`,
        width: `${open.value ? PANEL_WIDTH : ICON_SIZE}px`,
        height: `${open.value ? panelHeight.value : ICON_SIZE}px`,
        visibility: viewport.value.width ? 'visible' as const : 'hidden' as const,
    };
});

let pointer: { id: number; startX: number; startY: number; x: number; y: number } | undefined;
let suppressClick = false;
let suppressTimer: ReturnType<typeof setTimeout> | undefined;
let readyFrame = 0;

function measure() {
    viewport.value = { width: window.innerWidth, height: window.innerHeight };
    if (panel.value) panelHeight.value = panel.value.offsetHeight + 2;
}

function persistPosition() {
    try { localStorage.setItem(FLOATING_ACTIONS_STORAGE_KEY, JSON.stringify(position.value)); } catch { /* Storage can be disabled. */ }
}

function closePanel(restoreFocus = false) {
    // Release focus before the panel becomes inert, including during its closing animation.
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && panel.value?.contains(activeElement)) activeElement.blur();
    open.value = false;
    if (restoreFocus) void nextTick(() => {
        if (!open.value && !props.dialogOpen) trigger.value?.focus({ preventScroll: true });
    });
}

function togglePanel() {
    if (suppressClick) { suppressClick = false; return; }
    if (props.dialogOpen) return;
    if (open.value) { closePanel(true); return; }
    trigger.value?.blur();
    open.value = true;
    void nextTick(() => {
        if (!open.value || props.dialogOpen) return;
        measure();
        panel.value?.focus({ preventScroll: true });
    });
}

async function runAction() {
    closePanel();
    await nextTick();
    // Give dialogs a visible return-focus target before handing focus to the next view.
    if (!open.value && !props.dialogOpen) trigger.value?.focus({ preventScroll: true });
    emit('switch-locale');
}

function startDrag(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0) return;
    clearTimeout(suppressTimer);
    suppressClick = false;
    pointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY, ...docked.value };
    trigger.value?.setPointerCapture(event.pointerId);
}

function moveDrag(event: PointerEvent) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dx = event.clientX - pointer.startX, dy = event.clientY - pointer.startY;
    if (!dragging.value && Math.hypot(dx, dy) < 6) return;
    dragging.value = true;
    suppressClick = true;
    closePanel();
    dragPosition.value = {
        x: clampPosition(pointer.x + dx, viewport.value.width - ICON_SIZE, FLOATING_ACTIONS_HORIZONTAL_MARGIN),
        y: clampPosition(pointer.y + dy, viewport.value.height - ICON_SIZE, FLOATING_ACTIONS_VERTICAL_MARGIN),
    };
    event.preventDefault();
}

function finishDrag(event: PointerEvent) {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (dragging.value) {
        position.value = getReleasedPosition(dragPosition.value.x, dragPosition.value.y, viewport.value.width, viewport.value.height, ICON_SIZE, ICON_SIZE);
        persistPosition();
        // Pointer release normally produces a click. Suppress it without swallowing the next intentional click.
        suppressTimer = setTimeout(() => { suppressClick = false; }, 0);
    }
    pointer = undefined;
    dragging.value = false;
    if (trigger.value?.hasPointerCapture(event.pointerId)) trigger.value.releasePointerCapture(event.pointerId);
}

function cancelDrag() {
    if (!pointer) return;
    pointer = undefined;
    dragging.value = false;
    suppressTimer = setTimeout(() => { suppressClick = false; }, 0);
}

function handleOutside(event: PointerEvent) {
    if (open.value && !root.value?.contains(event.target as Node)) closePanel();
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open.value) {
        event.preventDefault();
        event.stopPropagation();
        closePanel(true);
    }
}

function handleFocusOut(event: FocusEvent) {
    if (event.relatedTarget instanceof Node && !root.value?.contains(event.relatedTarget)) closePanel();
}

watch(() => props.locale, () => { void nextTick(measure); });
watch(() => props.dialogOpen, visible => { if (visible) closePanel(); });
onMounted(() => {
    try { position.value = restoreFloatingActionsPosition(localStorage.getItem(FLOATING_ACTIONS_STORAGE_KEY)); } catch { /* Keep the default position. */ }
    measure();
    readyFrame = requestAnimationFrame(() => { ready.value = true; });
    window.addEventListener('resize', measure);
    document.addEventListener('pointerdown', handleOutside, true);
    document.addEventListener('keydown', handleKeydown);
    root.value?.addEventListener('focusout', handleFocusOut);
});
onBeforeUnmount(() => {
    clearTimeout(suppressTimer);
    cancelAnimationFrame(readyFrame);
    window.removeEventListener('resize', measure);
    document.removeEventListener('pointerdown', handleOutside, true);
    document.removeEventListener('keydown', handleKeydown);
    root.value?.removeEventListener('focusout', handleFocusOut);
});
</script>

<style scoped>
.floating-actions {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 1600;
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid var(--json-tool-border);
    border-radius: 4px;
    background: var(--json-tool-surface);
    color: var(--json-tool-text);
    box-shadow: 0 3px 12px rgba(16, 24, 40, 0.12);
    font-size: 14px;
}
.floating-actions.is-ready {
    transition: transform 220ms cubic-bezier(0.2, 0.7, 0.2, 1), width 220ms cubic-bezier(0.2, 0.7, 0.2, 1), height 220ms cubic-bezier(0.2, 0.7, 0.2, 1), box-shadow 220ms ease;
}
.floating-actions.is-open { box-shadow: 0 8px 28px rgba(16, 24, 40, 0.16); }
.floating-actions.is-dragging { transition: none; border-color: #409eff; }
.floating-trigger {
    position: absolute;
    top: 50%;
    right: 0;
    transform: translateY(-50%);
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: #409eff;
    cursor: grab;
    touch-action: none;
    user-select: none;
    opacity: 1;
    transition: opacity 100ms ease 100ms;
}
.is-left .floating-trigger { right: auto; left: 0; }
.is-open .floating-trigger { opacity: 0; visibility: hidden; pointer-events: none; transition: none; }
.floating-trigger:hover { background: var(--json-tool-archive-hover); }
.is-dragging .floating-trigger { cursor: grabbing; }
.action-icon {
    width: 20px;
    height: 20px;
    flex: 0 0 auto;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
}
.floating-trigger > .action-icon {
    width: 14px;
    height: 14px;
}
.floating-panel {
    position: absolute;
    top: 0;
    left: 0;
    width: 278px;
    max-height: calc(100vh - var(--floating-actions-vertical-margin) - var(--floating-actions-vertical-margin) - 2px);
    overflow-y: auto;
    box-sizing: border-box;
    padding: 12px;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: opacity 80ms ease, visibility 0s linear 220ms;
    outline: none;
}
.is-open .floating-panel { opacity: 1; visibility: visible; pointer-events: auto; transition: opacity 160ms ease 30ms; }
.panel-action {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    box-sizing: border-box;
    padding: 12px 10px;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: var(--json-tool-text);
    text-align: left;
    text-decoration: none;
    font: inherit;
    cursor: pointer;
}
.panel-action:hover { background: var(--json-tool-archive-hover); }
.action-copy { flex: 1; min-width: 0; }
.action-copy strong { display: block; font-size: 14px; font-weight: 600; }
.action-copy small { display: block; margin-top: 4px; color: var(--json-tool-text-muted); font-size: 12px; line-height: 1.5; }
.action-trailing { width: 16px; height: 16px; }
.action-arrow { color: var(--json-tool-text-muted); font-size: 22px; }
.panel-divider { height: 1px; margin: 6px 4px; background: var(--json-tool-border); }
.compact-action { min-height: 44px; padding-top: 10px; padding-bottom: 10px; }
.action-value { padding: 3px 7px; border-radius: 3px; background: var(--json-tool-surface-soft); color: var(--json-tool-text-muted); font-size: 12px; }
button:focus-visible, a:focus-visible { outline: 2px solid #409eff; outline-offset: -2px; }
@media (prefers-reduced-motion: reduce) {
    .floating-actions.is-ready, .floating-trigger, .floating-panel, .is-open .floating-panel { transition: none; }
}
@media (max-width: 900px) { .floating-actions { display: none; } }
</style>
