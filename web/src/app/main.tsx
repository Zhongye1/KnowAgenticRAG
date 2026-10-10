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
import { App } from './index';

const root = document.getElementById('root');
if (!root) throw new Error('No root element found');

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
