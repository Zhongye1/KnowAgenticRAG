import engineShot from '@/assets/home/engine-retrieval.png';

export const GITHUB = 'https://github.com/Zhongye1/KnowledgeRAG-GZHU';

export type IconName =
  | 'box'
  | 'sparkles'
  | 'plug'
  | 'wrench'
  | 'fork'
  | 'layers'
  | 'cpu'
  | 'database'
  | 'share'
  | 'scan'
  | 'shield'
  | 'key'
  | 'rocket'
  | 'chart';

export const stats = [
  { value: 'RAG + KG', label: '统一知识引擎' },
  { value: 'MCP + Skills', label: '可扩展智能体' },
  { value: 'Multi-tenant', label: '用户与部门权限' },
  { value: 'MIT', label: '开源可自托管' },
];

export type Capability = {
  icon: IconName;
  title: string;
  desc: string;
  tags: string[];
  span?: boolean;
};

export const capabilities: Capability[] = [
  {
    icon: 'box',
    title: '沙盒文件系统',
    desc: '每个会话拥有独立的虚拟文件系统（workspace / uploads / outputs），智能体产物自动落盘，支持文本、图片、PDF、HTML 在线预览与下载。',
    tags: ['预览', '下载', 'Artifacts 产物'],
  },
  {
    icon: 'sparkles',
    title: 'Skills 技能系统',
    desc: '内置图像生成、深度报告、数据报表等技能，支持上传与远程安装，「解析草稿 → 确认安装」。',
    tags: ['内置', '上传', '远程'],
  },
  {
    icon: 'plug',
    title: 'MCP 集成',
    desc: '通过 Model Context Protocol 标准协议接入外部工具服务，统一启停与权限管理。',
    tags: ['标准协议'],
  },
  {
    icon: 'wrench',
    title: '内置工具',
    desc: 'present_artifacts 交付产物、提问中断等待用户、按需安装技能、联网检索等开箱即用。',
    tags: ['开箱即用'],
  },
  {
    icon: 'fork',
    title: '子智能体 SubAgents',
    desc: '主智能体可编排隔离的子智能体，独立 child thread 执行复杂子任务并回传产物。',
    tags: ['隔离编排'],
  },
  {
    icon: 'layers',
    title: '中间件编排',
    desc: '知识库检索注入、附件处理、历史摘要 offload、动态工具注入等中间件可组合编排。',
    tags: ['可组合'],
  },
  {
    icon: 'cpu',
    title: '异步 Worker',
    desc: '基于 ARQ 的后台任务，将分钟到小时级长耗时任务异步执行，支持取消与流式输出。',
    tags: ['长任务', '可取消', '流式'],
  },
];

export type EngineTab = {
  key: string;
  icon: IconName;
  title: string;
  desc: string;
  shot?: string;
};

export const engineTabs: EngineTab[] = [
  {
    key: 'parse',
    icon: 'scan',
    title: '多格式解析',
    desc: 'Docling、MinerU 统一解析 PDF、Office、图片等为结构化 Markdown。',
  },
  {
    key: 'retrieval',
    icon: 'database',
    title: 'Agentic RAG',
    desc: '智能体自主决定检索时机与查询，多轮向量检索 + Rerank，回答带可溯源引用。',
    shot: engineShot,
  },
  {
    key: 'graph',
    icon: 'share',
    title: '知识图谱',
    desc: '抽取实体与关系构建知识图谱，子图检索参与增强，并支持可视化探索。',
  },
  {
    key: 'eval',
    icon: 'chart',
    title: '检索评估',
    desc: '内置检索质量评估，支持命名运行与指标对比，量化召回与回答效果。',
  },
  {
    key: 'sources',
    icon: 'plug',
    title: '多知识源接入',
    desc: '支持 Dify、Notion、飞书（规划中）等外部知识源接入，统一检索与引用。',
  },
];

const ICON_BASE =
  'https://registry.npmmirror.com/@lobehub/icons-static-svg/latest/files/icons';

const providers = [
  { name: 'OpenAI', icon: `${ICON_BASE}/openai.svg` },
  { name: 'DeepSeek', icon: `${ICON_BASE}/deepseek-color.svg` },
  { name: '通义千问', icon: `${ICON_BASE}/bailian-color.svg` },
  { name: '智谱 AI', icon: `${ICON_BASE}/zhipu-color.svg` },
  { name: 'Moonshot', icon: `${ICON_BASE}/moonshot.svg` },
  { name: 'MiniMax', icon: `${ICON_BASE}/minimax-color.svg` },
  { name: 'SiliconFlow', icon: `${ICON_BASE}/siliconcloud-color.svg` },
  { name: 'OpenRouter', icon: `${ICON_BASE}/openrouter.svg` },
  { name: 'ModelScope', icon: `${ICON_BASE}/modelscope-color.svg` },
  { name: 'OpenCode', icon: `${ICON_BASE}/opencode.svg` },
  { name: '小米 MiMo', icon: `${ICON_BASE}/xiaomimimo.svg` },
];

export const providersTop = [...providers, ...providers];

export const providersBottom = (() => {
  const rotated = [...providers.slice(5), ...providers.slice(0, 5)];
  return [...rotated, ...rotated];
})();

export const steps = [
  {
    n: '01',
    title: '配置底座',
    desc: '管理员接入模型供应商、构建知识库与知识图谱、划分用户与部门权限。',
  },
  {
    n: '02',
    title: '编排智能体',
    desc: '为 Agent 挂载 Skills、MCP、Tools 与子智能体，组合所需中间件能力。',
  },
  {
    n: '03',
    title: '检索与推理',
    desc: '对话中融合向量检索与知识图谱推理，沙盒工具执行真实任务。',
  },
  {
    n: '04',
    title: '交付产物',
    desc: '返回带引用来源的回答，并以可预览、可下载的产物卡片交付结果。',
  },
];

export const shots = [
  {
    title: '对话工作台',
    desc: '统一完成智能体对话、知识引用与产物交付',
  },
  {
    title: '智能体配置',
    desc: '挂载 Skills、MCP、子智能体与中间件',
  },
  {
    title: '知识图谱',
    desc: '构建、检索并可视化实体关系与子图',
  },
  {
    title: '组织权限',
    desc: '按用户和部门管理知识与平台能力',
  },
];

export const enterprise = [
  {
    icon: 'shield' as IconName,
    title: '多租户与权限',
    desc: '用户 / 部门级隔离，知识库支持全局、部门、指定人三档共享。',
  },
  {
    icon: 'key' as IconName,
    title: 'API Key 集成',
    desc: '签发独立密钥，供外部系统以 API 方式安全调用平台能力。',
  },
  {
    icon: 'layers' as IconName,
    title: '一键部署',
    desc: 'Docker Compose 快速拉起前后端与依赖服务，私有化开箱即用。',
  },
];

export const cases = [
  {
    title: '内部知识服务',
    desc: '把制度、产品和技术资料变成有权限边界、带来源引用的知识助手。',
  },
  {
    title: '研究与内容交付',
    desc: '让智能体检索资料、调用工具并交付报告、图表、网页等可下载产物。',
  },
  {
    title: '组织级 Agent 平台',
    desc: '统一管理模型、知识、工具和扩展能力，为业务系统提供可调用的 Agent 服务。',
  },
];

export const techStack = [
  { group: '前端', items: ['React 18', 'TypeScript', 'Vite', 'Tailwind CSS'] },
  { group: '后端', items: ['FastAPI', 'SQLAlchemy', 'Celery'] },
  { group: '存储', items: ['PostgreSQL', 'Redis', 'MinIO', 'Milvus'] },
  { group: '消息队列', items: ['RabbitMQ', 'Celery Worker'] },
  { group: '可观测', items: ['OpenTelemetry', 'Prometheus', 'Loki', 'Tempo'] },
  { group: '解析', items: ['Docling', 'MinerU', 'OCR'] },
  { group: '部署', items: ['Docker Compose', 'Nginx'] },
];

export const credits = [
  { name: 'LightRAG', url: 'https://github.com/HKUDS/LightRAG' },
  { name: 'DeepAgents', url: 'https://github.com/langchain-ai/deepagents' },
  { name: 'DeerFlow', url: 'https://github.com/bytedance/deer-flow' },
  { name: 'RAGflow', url: 'https://github.com/infiniflow/ragflow' },
  { name: 'LangGraph', url: 'https://github.com/langchain-ai/langgraph' },
  { name: 'QwenPaw', url: 'https://github.com/agentscope-ai/QwenPaw' },
];

export const quickStartCode = `# 1. 克隆并初始化
git clone https://github.com/Zhongye1/KnowledgeRAG-GZHU.git
cd KnowledgeRAG-GZHU

# 2. 使用 Docker Compose 启动
docker-compose up -d

# 3. 浏览器访问
open http://localhost:8080`;
