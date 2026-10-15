/**
 * 知识工作六块：RAG / Agent / 智能体评估 / 沙箱 / 图谱 / 技能。
 *
 * 每块由「图位 + 图标与分类标 + 标题 + 说明 + 标签组 + 入口」组成；图位放真实截图，
 * 按 16/10 画幅整张放进来（`contain`），不裁掉界面上的控件。
 *
 * 事实来源：`ars/knowledge`（解析、检索、图谱）、`ars/agents`（middlewares / toolkits /
 * skills / mcp 组合能力）、ARCHITECTURE.md（内置 Skills 是 shipping contract 的组成、
 * 沙盒由 sandbox-provisioner 提供隔离执行、Workdir 与共享 Skills 根约束虚拟路径）。
 */
import {
  Blocks,
  BookOpen,
  Bot,
  Box,
  FileSearch,
  Network,
} from 'lucide-react';

import { outbound } from '../lib/links';

const PILLARS = [
  {
    label: 'RAG',
    Icon: FileSearch,
    shot: {
      src: '/assets/home/02-1.png',
      alt: '对话里打开 PDF 原文，逐条核对回答引用的来源',
    },
    title: '生成结果溯源',
    body: '结合语义与关键词检索查找相关资料，回答附带来源引用，可打开原文核对。',
    tags: ['混合检索', '多模态解析', '原文引用'],
    linkLabel: '了解 RAG',
    href: outbound.docsKnowledge,
  },
  {
    label: 'AGENT',
    Icon: Bot,
    shot: {
      src: '/assets/home/02-2.png',
      alt: '智能体管理页里的主智能体与子智能体',
    },
    title: '用知识和工具完成任务',
    body: '检索资料、调用 MCP 工具与技能，在沙箱或本机浏览器中完成任务。保留长期记忆，对话中可追加要求、分叉或回滚。',
    tags: ['多步推理', '子智能体', '长期记忆'],
    linkLabel: '了解 Agent',
    href: outbound.docsAgents,
  },
  {
    label: 'VAL',
    Icon: BookOpen,
    shot: {
      src: '/assets/home/02-3.png',
      alt: 'RAG 评估页里的最新一次评估指标与历史评估记录',
    },
    title: '智能体评估',
    body: '通过 Langfuse Dataset 评估智能体在研究、编程、文件处理或多步骤任务上的表现',
    tags: ['开发调优', '质量保障'],
    linkLabel: '智能体评估',
    href: outbound.docsEvaluation,
  },
  {
    label: 'SANDBOX',
    Icon: Box,
    shot: {
      src: '/assets/home/02-4.png',
      alt: '沙箱里运行的隔离容器列表',
    },
    title: '在隔离沙箱里执行',
    body: '读写文件、跑脚本都在隔离沙箱内，产物落到持久 Workdir，文档、表格、图片与 PDF 可在浏览器里直接预览。',
    tags: ['隔离执行', '持久 Workdir', '文件预览'],
    linkLabel: '了解沙箱',
    href: outbound.docsSandbox,
  },
  {
    label: 'GRAPH',
    Icon: Network,
    shot: {
      src: '/assets/home/02-5.png',
      alt: '知识图谱把文档里的实体与关系连成一张网',
    },
    title: '知识图谱支持',
    body: '从文档里抽取实体与关系，按 schema 约束建图，同名实体自动合并；检索时图谱与向量互补。',
    tags: ['实体关系抽取', '图谱检索', '可视化'],
    linkLabel: '了解图谱',
    href: outbound.docsGraph,
  },
  {
    label: 'SKILLS',
    Icon: Blocks,
    shot: {
      src: '/assets/home/02-6.png',
      alt: '扩展页的技能列表，内置与自建技能按需加载',
    },
    title: 'skill安装与管理',
    body: '内置与自建技能按任务加载，个人技能留在自己的工作区，共享技能只读挂载给智能体。',
    tags: ['内置技能', '自建技能', '按需加载'],
    linkLabel: '了解 Skills',
    href: outbound.docsSkills,
  },
] as const;

export const KnowledgeWorkSection = () => (
  <section
    id="knowledge-work"
    className="home-band"
    aria-labelledby="knowledge-work-title"
  >
    <div className="home-shell">
      <p className="home-eyebrow mb-4">02 / KNOWLEDGE AT WORK</p>

      <div className="home-band-head flex flex-wrap items-end justify-between gap-x-[clamp(24px,4vw,72px)] gap-y-4">
        <h2 id="knowledge-work-title" className="home-title max-w-[15em]">
          知识问答、任务执行与自动 Wiki
        </h2>
        <p className="home-body max-w-[24em]">
          六种能力跑在同一套知识底座上：问答、执行、整理之外，还有沙箱、图谱与技能。
        </p>
      </div>

      <ul className="pillars">
        {PILLARS.map((pillar) => {
          const Icon = pillar.Icon;
          return (
            <li className="pillar flex flex-col" key={pillar.label}>
              {/* 图位：16/10 固定画幅，截图按 cover 填满 */}
              <div className="pillar-shot">
                <img src={pillar.shot.src} alt={pillar.shot.alt} />
              </div>

              <div className="pillar-head">
                <h3 className="pillar-title">
                  <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                  {pillar.title}
                </h3>
                <span className="home-eyebrow">{pillar.label}</span>
              </div>

              <p className="home-body mt-[clamp(12px,1.4vw,18px)]">
                {pillar.body}
              </p>

              <ul className="home-chips mt-[clamp(20px,2.2vw,28px)]">
                {pillar.tags.map((tag) => (
                  <li className="home-chip" key={tag}>
                    {tag}
                  </li>
                ))}
              </ul>

              <a
                className="home-link mt-auto pt-[clamp(24px,2.8vw,40px)]"
                href={pillar.href}
              >
                {pillar.linkLabel}
                <span aria-hidden="true">→</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  </section>
);
