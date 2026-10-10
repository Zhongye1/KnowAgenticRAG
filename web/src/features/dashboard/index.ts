/**
 * 数据总览切片的对外接口。其余层只从这里引用，不深入 `api` / `model` / `ui` 内部。
 *
 * 对外只有两个 tab 的内容与反馈弹窗；tab 的激活时机、URL 参数与外壳属于 `pages/dashboard`。
 */
export { DashboardOverviewTab } from './ui/overview-tab';
export { DashboardThreadsTab } from './ui/threads-tab';
export { FeedbackDialog } from './ui/feedback-dialog';
