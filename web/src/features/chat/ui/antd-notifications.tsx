/**
 * 对话页的 antd 通知适配。
 *
 * shared/ui/notifications 的词汇是 `{type, title, message}`（右上角堆叠、可关闭），
 * antd `App.useApp()` 的 message 是轻提示（顶部居中、自动消失）。本适配保留调用方的
 * 词汇：title 并进正文（「对话： xxx」），message 尊重 antd 对 ReactNode 的渲染。
 *
 * 迁移期两个消费方（chat-page、message-actions）改一个 import；B6 收口后评估是否
 * 整体换成 antd notification（右上角堆叠与参照一致，代价是 Context 依赖更深）。
 */
import { App as AntdApp } from 'antd';

export type ChatNotificationType = 'info' | 'warning' | 'success' | 'error';

export type ChatNotification = {
  type: ChatNotificationType;
  title: string;
  message: string;
};

export type ChatNotificationsApi = {
  addNotification: (notification: ChatNotification) => void;
};

export const useNotifications = (): ChatNotificationsApi => {
  const { message } = AntdApp.useApp();

  return {
    addNotification: ({ type, title, message: body }) => {
      message[type](`${title}：${body}`);
    },
  };
};
