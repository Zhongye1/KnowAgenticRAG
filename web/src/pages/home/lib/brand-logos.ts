/**
 * 首页集成段与厂商条用到的品牌标，一个品牌一行。
 *
 * 逐品牌深导入，不走 `@lobehub/icons` 包入口：包入口会把 `@lobehub/ui` 连同
 * `@emoji-mart/data` 的 JSON 一起拉进来，那份 JSON 在 Node ESM 下需要 import attribute，
 * vitest 会因此整份用例文件加载失败（供应商面板的用例就是这么红的）。深导入只带单个
 * 品牌的 Mono 标，打包时也只收用到的品牌。
 *
 * 单独成一层是为了让用例只要替身这一个模块（`vi.mock('@/pages/home/lib/brand-logos')`）。
 * Mono 形态是 `fill: currentColor`，颜色由调用方的文字色决定，页面不出现品牌色。
 */
export { default as Claude } from '@lobehub/icons/es/Claude';
export { default as DeepSeek } from '@lobehub/icons/es/DeepSeek';
export { default as Dify } from '@lobehub/icons/es/Dify';
export { default as Gemini } from '@lobehub/icons/es/Gemini';
export { default as Github } from '@lobehub/icons/es/Github';
export { default as Hunyuan } from '@lobehub/icons/es/Hunyuan';
export { default as Kimi } from '@lobehub/icons/es/Kimi';
export { default as MCP } from '@lobehub/icons/es/MCP';
export { default as Minimax } from '@lobehub/icons/es/Minimax';
export { default as Notion } from '@lobehub/icons/es/Notion';
export { default as Ollama } from '@lobehub/icons/es/Ollama';
export { default as OpenAI } from '@lobehub/icons/es/OpenAI';
export { default as Qwen } from '@lobehub/icons/es/Qwen';
export { default as Volcengine } from '@lobehub/icons/es/Volcengine';
export { default as Zhipu } from '@lobehub/icons/es/Zhipu';
