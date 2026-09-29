import { nanoid } from 'nanoid';
import { create } from 'zustand';

export type Notification = {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message?: string;
};

type NotificationsStore = {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  dismissNotification: (id: string) => void;
};

/**
 * 通知是全局渲染出口，这里兜底把任意 payload 折叠成字符串。
 * 后端错误体可能是结构化对象（如 422 的 { code, reason, suggestion }），
 * 直接渲染对象会抛 "Objects are not valid as a React child"，
 * 让整棵组件树被 ErrorBoundary 兜底成错误页。
 */
const asText = (value: unknown, fallback: string): string => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  if (value instanceof Error) return value.message || fallback;
  try {
    return JSON.stringify(value) ?? fallback;
  } catch {
    return fallback;
  }
};

export const useNotifications = create<NotificationsStore>((set) => ({
  notifications: [],
  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        {
          id: nanoid(),
          ...notification,
          // 文本字段最后收口：payload 非字符串时不让它进渲染层
          title: asText(notification.title, '提示'),
          message:
            notification.message === undefined
              ? undefined
              : asText(notification.message, ''),
        },
      ],
    })),
  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter(
        (notification) => notification.id !== id,
      ),
    })),
}));
