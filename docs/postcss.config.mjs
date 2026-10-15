// Tailwind v4 在文档站的接入点：theme/home/home.css 里的 `@import 'tailwindcss/...'`
// 由本插件展开，rsbuild 在 docs/ 下按惯例自动加载本文件。
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
