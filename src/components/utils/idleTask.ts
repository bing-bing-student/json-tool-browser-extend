type IdleWindow = Window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
};

/** 安排非首屏任务，返回路由卸载时可调用的取消函数。 */
export const scheduleIdleTask = (task: () => void, timeout: number = 2000): (() => void) => {
    if (typeof window === 'undefined') return () => {};

    const browserWindow = window as IdleWindow;
    let cancelled = false;
    const run = () => {
        if (!cancelled) task();
    };

    if (browserWindow.requestIdleCallback) {
        const handle = browserWindow.requestIdleCallback(run, { timeout });
        return () => {
            cancelled = true;
            browserWindow.cancelIdleCallback?.(handle);
        };
    }

    const handle = browserWindow.setTimeout(run, 32);
    return () => {
        cancelled = true;
        browserWindow.clearTimeout(handle);
    };
};
