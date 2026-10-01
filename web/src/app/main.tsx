import * as React from 'react';
import { createRoot } from 'react-dom/client';

// 全局样式与 token 是工具链固定点，物理位置保留在 src/ 根下
import '../index.css';
import '../styles/tokens.css';
import '../styles/brand.css';
import { App } from './index';

const root = document.getElementById('root');
if (!root) throw new Error('No root element found');

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
