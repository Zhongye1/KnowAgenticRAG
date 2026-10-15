/**
 * 应用级通知。
 *
 * antd `App.useApp()` 的 `message` 轻提示（顶部居中、自动消失），与参照主力用法一致
 * （KnowAgenticRAG `message.*` 483 处）。旧的自绘右上角堆叠宿主已删除；`dismiss` API 没有外部
 * 消费者，不保留。
 *
 * 词汇是 `{type, title, message}`：title 并进正文（「标题：正文」），message 尊重
 * antd 对 ReactNode 的渲染。非字符串 payload 在调用点自行折叠成字符串。
 */
import { App as AntdApp } from 'antd';

export type NotificationType = 'info' | 'warning' | 'success' | 'error';

export type NotificationInput = {
  type: NotificationType;
  title: string;
  message?: string;
};

export type NotificationsApi = {
  addNotification: (notification: NotificationInput) => void;
};

/** 通知是全局渲染出口：payload 非字符串时折叠成文本，不让它炸渲染层。 */
export const asText = (value: unknown, fallback: string): string => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  if (value instanceof Error) return value.message || fallback;
  try {
    return JSON.stringify(value) ?? fallback;
  } catch {
    return fallback;
  }
};

/** 取通知句柄；必须在 `AntdApp` 上下文内调用（应用外壳已装配）。 */
export const useNotifications = (): NotificationsApi => {
  const { message } = AntdApp.useApp();

  return {
    addNotification: ({ type, title, message: body }) => {
      const text = body === undefined ? '' : asText(body, '');
      message[type](`${title}：${text}`.replace(/：$/, ''));
    },
  };
};
