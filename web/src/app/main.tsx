import * as React from 'react';
import { createRoot } from 'react-dom/client';

// 全局样式与 token 是工具链固定点，物理位置保留在 src/ 根下。
// index.css 声明层叠顺序并引入 antd reset；antd-overrides.css 放最后，
// 让全局 `.ant-*` 覆盖压住 antd 自己注入的层内样式。
import '../index.css';
import '../styles/yuxi-tokens.css';
import '../styles/tokens.css';
import '../styles/brand.css';
import '../styles/antd-overrides.css';
// 首页的页面级样式：token 与字体映射一份，参照样式一份，接入面板与上下文段一份
// （见 tracked 决策记录）
import '../styles/home-tokens.css';
import '../styles/home.css';
import '../styles/home-panels.css';
import { App } from './index';

const root = document.getElementById('root');
if (!root) throw new Error('No root element found');

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
