const normalizeIdSegment = (value: string) => {
    const normalized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized || 'field';
};

const getTextareaRole = (textarea: HTMLTextAreaElement, index: number) => {
    if (textarea.closest('.find-widget')) {
        const part = textarea.closest('.replace-part') ? 'replace' : textarea.closest('.find-part') ? 'find' : 'widget';
        const label = textarea.getAttribute('aria-label') || textarea.getAttribute('placeholder') || `field-${index + 1}`;
        return `find-widget-${part}-${normalizeIdSegment(label)}`;
    }

    if (textarea.classList.contains('inputarea')) {
        return 'editor-input';
    }

    const label = textarea.getAttribute('aria-label') || textarea.getAttribute('placeholder');
    if (label) {
        return normalizeIdSegment(label);
    }

    return `textarea-${index + 1}`;
};

const applyTextareaAttrs = (container: HTMLElement, prefix: string) => {
    const textareas = Array.from(container.querySelectorAll<HTMLTextAreaElement>('textarea'));
    const roleCount = new Map<string, number>();

    textareas.forEach((textarea, index) => {
        const role = getTextareaRole(textarea, index);
        const nextCount = (roleCount.get(role) || 0) + 1;
        roleCount.set(role, nextCount);

        const uniqueRole = nextCount === 1 ? role : `${role}-${nextCount}`;
        const attrValue = `${prefix}-${uniqueRole}`;

        if (!textarea.id) {
            textarea.id = attrValue;
        }
        if (!textarea.getAttribute('name')) {
            textarea.setAttribute('name', attrValue);
        }
    });
};

const shouldSyncForMutations = (mutations: MutationRecord[]) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;
            if (node.tagName === 'TEXTAREA' || node.classList.contains('find-widget') || node.querySelector('textarea') || node.querySelector('.find-widget')) {
                return true;
            }
        }
    }

    return false;
};

export interface MonacoTextareaAttrObserver {
    disconnect: () => void;
    syncNow: () => void;
}

export const ensureMonacoTextareaAttrs = (container: HTMLElement, prefix: string): MonacoTextareaAttrObserver => {
    const syncNow = () => applyTextareaAttrs(container, prefix);

    const observer = new MutationObserver((mutations) => {
        if (!shouldSyncForMutations(mutations)) return;
        syncNow();
    });

    observer.observe(container, {
        childList: true,
        subtree: true,
    });

    syncNow();

    return {
        disconnect: () => observer.disconnect(),
        syncNow,
    };
};
