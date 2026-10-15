/**
 * 首页截图。
 *
 * 图片主副本在 `web/public/assets/home/`（SPA 首页与文档站首页共用一份）：这里按相对
 * 路径导入，由 rsbuild 输出带 base 与内容哈希的地址。换成 public 目录下的绝对路径会漏
 * 掉 `/KnowledgeRAG-OGAS/` 前缀，线上 404。
 *
 * 各图的真实像素写在引用处（`width` / `height`），换图时图片与那两个数字要一起改。
 */
import shot11 from '../../../../web/public/assets/home/1-1.png';
import shot12 from '../../../../web/public/assets/home/1-2.png';
import shot13 from '../../../../web/public/assets/home/1-3.png';
import shot14 from '../../../../web/public/assets/home/1-4.png';
import shot21 from '../../../../web/public/assets/home/02-1.png';
import shot22 from '../../../../web/public/assets/home/02-2.png';
import shot23 from '../../../../web/public/assets/home/02-3.png';
import shot24 from '../../../../web/public/assets/home/02-4.png';
import shot25 from '../../../../web/public/assets/home/02-5.png';
import shot26 from '../../../../web/public/assets/home/02-6.png';

export const shots = {
  /** 1-1 统一智能体工作台 */
  workbench: shot11,
  /** 1-2 知识库与可追溯 RAG */
  knowledgeBase: shot12,
  /** 1-3 多智能体与扩展能力 */
  multiAgent: shot13,
  /** 1-4 工作区与产物管理 */
  workdir: shot14,
  /** 02-1 生成结果溯源 */
  rag: shot21,
  /** 02-2 用知识和工具完成任务 */
  agent: shot22,
  /** 02-3 智能体评估 */
  evaluation: shot23,
  /** 02-4 在隔离沙箱里执行 */
  sandbox: shot24,
  /** 02-5 知识图谱支持 */
  graph: shot25,
  /** 02-6 skill 安装与管理 */
  skills: shot26,
} as const;
