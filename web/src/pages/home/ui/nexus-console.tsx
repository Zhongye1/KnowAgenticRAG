/**
 * NexusConsole：接入方式面板（照搬参照实现的 `nexus-console.tsx`）。
 *
 * 与参照的差异：
 * - 配色由 Tailwind 调色板类改成页面语义类（`nx-*`），结构性样式与语义类都放在
 *   `styles/home-panels.css`；
 * - 首页固定浅色，去掉全部 `dark:` 分支；
 * - 第二个 CTA 由参照的 Test Sandbox 换成本仓的快速开始（本仓没有 playground）。
 *
 * 三张标签页的内容见 `api/access-tabs.ts`：MCP 照搬参照，API 与 CLI 用本仓事实。
 *
 * 来源：AI Website Cloner Template 0.6.1（MIT，JCodesMore）里的 AusVector 首页克隆。
 */
import * as React from 'react';

import { ACCESS_TABS, type AccessTab } from '../api/access-tabs';
import { outbound } from '../lib/links';

/**
 * 自定义滚动条是 DOM 元素而不是原生滚动条，需要手工与 `<pre>` 的滚动偏移同步；
 * 参照还会把溢出状态写到外框的 data 属性上，由 CSS 决定是否显示轨道。
 *
 * `resetKey` 传当前标签：切标签只换 `<pre>` 的文字，元素盒子尺寸不变，
 * ResizeObserver 不会触发，不重算就会把上一页的溢出状态与 thumb 位置留在界面上。
 */
const useConsoleScrollbars = (
  frameRef: React.RefObject<HTMLDivElement | null>,
  codeRef: React.RefObject<HTMLPreElement | null>,
  resetKey: string,
) => {
  const [metrics, setMetrics] = React.useState({
    vertical: { visible: false, top: 0, height: 0 },
    horizontal: { visible: false, left: 0, width: 0 },
  });

  React.useEffect(() => {
    const frame = frameRef.current;
    const code = codeRef.current;
    if (!frame || !code) return;

    const sync = () => {
      const { scrollWidth, scrollHeight, clientWidth, clientHeight } = code;

      const vertical = scrollHeight > clientHeight + 1;
      const horizontal = scrollWidth > clientWidth + 1;

      frame.dataset.verticalOverflow = String(vertical);
      frame.dataset.horizontalOverflow = String(horizontal);

      setMetrics({
        vertical: {
          visible: vertical,
          top: vertical ? (code.scrollTop / scrollHeight) * 100 : 0,
          height: vertical ? (clientHeight / scrollHeight) * 100 : 0,
        },
        horizontal: {
          visible: horizontal,
          left: horizontal ? (code.scrollLeft / scrollWidth) * 100 : 0,
          width: horizontal ? (clientWidth / scrollWidth) * 100 : 0,
        },
      });
    };

    sync();
    code.addEventListener('scroll', sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(code);
    return () => {
      code.removeEventListener('scroll', sync);
      observer.disconnect();
    };
  }, [frameRef, codeRef, resetKey]);

  return metrics;
};

export const NexusConsole = () => {
  const [activeTab, setActiveTab] = React.useState<AccessTab['id']>('MCP');
  const [copied, setCopied] = React.useState(false);

  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const codeRef = React.useRef<HTMLPreElement | null>(null);
  const metrics = useConsoleScrollbars(frameRef, codeRef, activeTab);

  const tab = ACCESS_TABS.find((item) => item.id === activeTab) ?? ACCESS_TABS[0];

  const copyEndpoint = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(tab.endpoint);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [tab.endpoint]);

  return (
    <div className="nexus-console w-full flex flex-col gap-6 mt-4">
      <div className="flex flex-col gap-3 border-b nx-line pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider nx-muted">
              ACCESS
            </span>
            <div
              // 参照用 role=group + aria-pressed 的切换组；没有等价语义标签可用
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- 切换组，非表单控件
              role="group"
              aria-label="Access method"
              className="flex items-center gap-1 p-1 nx-tabs rounded-lg border"
            >
              {ACCESS_TABS.map((item) => {
                const isActive = item.id === activeTab;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setActiveTab(item.id)}
                    className={
                      isActive
                        ? 'px-4 py-2 rounded-md font-mono text-xs font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer nx-tab-active shadow-sm'
                        : 'px-4 py-2 rounded-md font-mono text-xs font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer nx-tab'
                    }
                  >
                    {item.id}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] nx-muted md:ml-auto">
            <span className="w-2 h-2 rounded-full nx-dot-ok animate-pulse" />
            <span>AUTHENTICATED ENDPOINT ACTIVE</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 nx-surface border rounded-xl p-6 shadow-sm">
        <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded nx-eyebrow font-mono text-[11px] uppercase tracking-widest font-semibold mb-3">
              {tab.eyebrow}
            </div>
            <h3 className="text-2xl font-bold tracking-tight nx-ink mb-2">
              {tab.title}
            </h3>
            <p className="text-sm nx-body leading-relaxed mb-4">
              {tab.description}
            </p>
            <div className="space-y-2 mb-6">
              {tab.specs.map((spec) => (
                <div
                  key={spec.label}
                  className="text-xs font-mono nx-muted flex items-center justify-between border-b nx-line-soft py-1.5"
                >
                  <span>{spec.label}</span>
                  <span className="font-semibold nx-strong">{spec.value}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider nx-strong font-medium">
                ACCESS FEATURES
              </span>
              <div className="nexus-console-feature-list pt-1">
                {tab.features.map((feature) => (
                  <span
                    className="nexus-console-feature font-mono text-[11px]"
                    key={feature}
                  >
                    {feature}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-4 border-t nx-line-soft">
            <a className="button button-primary nx-cta" href={tab.docsHref}>
              Protocol Docs <span aria-hidden="true">↗</span>
            </a>
            <a className="button button-quiet nx-cta" href={outbound.docsQuickStart}>
              Quick start
            </a>
          </div>
        </div>

        <div className="lg:col-span-6 flex flex-col justify-between nx-term rounded-lg p-5 font-mono border shadow-inner">
          <div className="flex items-center justify-between pb-3 border-b nx-term-line mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full nx-dot-err" />
              <span className="w-2.5 h-2.5 rounded-full nx-dot-warn" />
              <span className="w-2.5 h-2.5 rounded-full nx-dot-ok" />
              <span className="text-[11px] nx-term-faint pl-2">
                {tab.stream}
              </span>
            </div>
            <span className="text-[11px] nx-term-soft tracking-wider">
              LIVE SPEC
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 nx-term-deep border rounded p-2.5 mb-4">
            <code className="text-xs nx-term-accent truncate select-all">
              {tab.endpoint}
            </code>
            <button className="copy-button" type="button" onClick={copyEndpoint}>
              {copied ? 'Copied' : 'Copy endpoint'}
            </button>
          </div>

          <div className="nexus-code-frame" ref={frameRef}>
            <pre
              className="nexus-code-scroll text-[11.5px] leading-relaxed nx-term-code overflow-auto p-3 rounded border max-h-[220px]"
              ref={codeRef}
            >
              {tab.code}
            </pre>
            <span
              className="nexus-scroll-track nexus-scroll-track-y"
              aria-hidden="true"
              style={{ opacity: metrics.vertical.visible ? 1 : 0 }}
            >
              <span
                className="nexus-scroll-thumb nexus-scroll-thumb-y"
                style={{
                  top: `${metrics.vertical.top}%`,
                  height: `${metrics.vertical.height}%`,
                }}
              />
            </span>
            <span
              className="nexus-scroll-track nexus-scroll-track-x"
              aria-hidden="true"
              style={{ opacity: metrics.horizontal.visible ? 1 : 0 }}
            >
              <span
                className="nexus-scroll-thumb nexus-scroll-thumb-x"
                style={{
                  left: `${metrics.horizontal.left}%`,
                  width: `${metrics.horizontal.width}%`,
                }}
              />
            </span>
          </div>

          <div className="flex items-center justify-between pt-3 mt-3 border-t nx-term-line text-[11px] nx-term-soft">
            <span>{tab.transport}</span>
            <span>AUTHENTICATED ACCESS</span>
          </div>
        </div>
      </div>
    </div>
  );
};
