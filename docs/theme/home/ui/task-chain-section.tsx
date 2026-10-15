/**
 * 任务链段：左列四条环节（竖向 tablist），右侧跟着换对应的产品截图。
 *
 * 版面按参考图的语言：眉标 + 大标题 + 右侧文字链 + 通栏分隔线；下方左列是「图标 +
 * 粗标题 + 说明」的条目列表（条目之间是细横线，当前条目靠左侧竖条与墨色标题区分），
 * 右列是一张把截图撑满的浅色卡。
 *
 * 截图取自 web/public/assets/home（与 SPA 首页同一份文件），与四条环节一一对应；面板里只
 * 渲染当前那一张，切换时换 src。每张的 `width`/`height` 是文件真实像素（也是 `img` 的
 * 占位比例来源），换图时要一起改。
 */
import { Bot, FolderOpen, LayoutDashboard, Library } from 'lucide-react';
import * as React from 'react';
import { Link } from '@theme';

import { outbound } from '../lib/links';
import { shots } from '../lib/shots';

const ITEMS = [
  {
    title: '统一智能体工作台',
    Icon: LayoutDashboard,
    body: '在同一条任务链中查看知识引用、执行状态、上下文用量、子智能体和交付文件。',
    shot: { src: shots.workbench, width: 1520, height: 856 },
  },
  {
    title: '知识库与可追溯 RAG',
    Icon: Library,
    body: '管理目录与文件，查看解析状态，并从检索测试、知识图谱和评估入口持续校准知识质量。',
    shot: { src: shots.knowledgeBase, width: 1600, height: 900 },
  },
  {
    title: '多智能体与扩展能力',
    Icon: Bot,
    body: '配置主智能体与 SubAgents，并按任务加载 Skills、MCP 和工具。',
    shot: { src: shots.multiAgent, width: 1600, height: 900 },
  },
  {
    title: '工作区与产物管理',
    Icon: FolderOpen,
    body: '让任务结果落到持久 Workdir，在浏览器内预览文档、表格、图片、PDF 与网页。',
    shot: { src: shots.workdir, width: 1600, height: 900 },
  },
] as const;

/** 默认停在第二条，与参考图一致。 */
const INITIAL_INDEX = 1;

export const TaskChainSection = () => {
  const [activeIndex, setActiveIndex] = React.useState(INITIAL_INDEX);
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  /** 竖向 tablist 的键盘约定：上下（含左右）移动、Home/End 跳到首尾，焦点随选中项走。 */
  const move = (from: number, delta: number | 'first' | 'last') => {
    const next =
      delta === 'first'
        ? 0
        : delta === 'last'
          ? ITEMS.length - 1
          : (from + delta + ITEMS.length) % ITEMS.length;
    setActiveIndex(next);
    tabRefs.current[next]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => move(index, 1),
      ArrowRight: () => move(index, 1),
      ArrowUp: () => move(index, -1),
      ArrowLeft: () => move(index, -1),
      Home: () => move(index, 'first'),
      End: () => move(index, 'last'),
    };
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  const active = ITEMS[activeIndex];

  return (
    <section
      id="task-chain"
      className="home-band home-band-sunken"
      aria-labelledby="task-chain-title"
    >
      <div className="home-shell">
        <p className="home-eyebrow mb-4">01 / TASK CHAIN</p>

        <div className="home-band-head flex flex-wrap items-end justify-between gap-x-[clamp(24px,4vw,72px)] gap-y-4">
          <h2 id="task-chain-title" className="home-title">
            从检索到交付，沿一条任务链发生
          </h2>
          <Link className="home-link" href={outbound.docs}>
            查看完整文档 <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div className="home-cols grid grid-cols-[minmax(260px,1fr)_minmax(0,2.4fr)] gap-x-[clamp(32px,3.4vw,56px)] max-[1024px]:grid-cols-1">
          <ul
            className="chain-list"
            role="tablist"
            aria-orientation="vertical"
            aria-label="任务链环节"
          >
            {ITEMS.map((item, index) => {
              const Icon = item.Icon;
              return (
                <li key={item.title} role="presentation">
                  <button
                    type="button"
                    role="tab"
                    id={`task-chain-tab-${index}`}
                    aria-selected={index === activeIndex}
                    aria-controls="task-chain-panel"
                    tabIndex={index === activeIndex ? 0 : -1}
                    ref={(node) => {
                      tabRefs.current[index] = node;
                    }}
                    className="chain-tab w-full py-[clamp(18px,2vw,26px)] pr-6 pl-5"
                    onClick={() => setActiveIndex(index)}
                    onKeyDown={(event) => onKeyDown(event, index)}
                  >
                    <span className="chain-tab-head">
                      <Icon
                        className="chain-tab-icon flex-none"
                        size={18}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      <span className="chain-tab-title">{item.title}</span>
                    </span>
                    <span className="home-body block">{item.body}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <figure
            className="chain-shot"
            id="task-chain-panel"
            role="tabpanel"
            aria-labelledby={`task-chain-tab-${activeIndex}`}
            tabIndex={0}
          >
            <img
              src={active.shot.src}
              width={active.shot.width}
              height={active.shot.height}
              alt={`「${active.title}」的产品界面截图`}
            />
          </figure>
        </div>
      </div>
    </section>
  );
};
