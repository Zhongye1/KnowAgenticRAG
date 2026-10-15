// RSPress 内置 Badge，注册到 markdown.globalComponents 后文档可直接写 <Badge type="info" text="0.3.5" />。
// globalComponents 只注入默认导入、组件名取自文件名，因此这里必须以 default 导出。
export { Badge as default } from '@rspress/core/theme-original';
