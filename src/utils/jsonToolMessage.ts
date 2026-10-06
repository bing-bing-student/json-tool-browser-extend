import { ElMessage } from 'element-plus';

const MESSAGE_CUSTOM_CLASS = 'json-tool-message';
const MESSAGE_OFFSET = 2;
type MessageType = 'success' | 'error' | 'warning' | 'info';

export const globalNotify = (type: MessageType, message: string, duration?: number) => {
    ElMessage({
        message,
        type,
        duration,
        offset: MESSAGE_OFFSET,
        customClass: MESSAGE_CUSTOM_CLASS,
    });
};

export const showMessageSuccess = (message: string, duration?: number) => globalNotify('success', message, duration);
export const showMessageError = (message: string, duration?: number) => globalNotify('error', message, duration);
export const showMessageWarning = (message: string, duration?: number) => globalNotify('warning', message, duration);
export const showMessageInfo = (message: string, duration?: number) => globalNotify('info', message, duration);
