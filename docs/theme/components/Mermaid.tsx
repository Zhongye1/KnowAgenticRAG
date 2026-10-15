import { useEffect, useRef, useState } from 'react';

type MermaidProps = {
  /** 图表源码，由 remark 插件从 ```mermaid 代码块搬进来。 */
  chart?: string;
};

/**
 * 客户端渲染 Mermaid 图表。
 *
 * mermaid 体积不小且只认浏览器环境，因此动态 import 并只在挂载后渲染；SSR 阶段
 * 输出一个空容器。渲染结果随 html.dark 主题切换重画，避免暗色页面里出现亮色图。
 */
export default function Mermaid({ chart = '' }: MermaidProps) {
  const source = chart.trim();
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!source || !containerRef.current) return;
    let cancelled = false;
    let observer: MutationObserver | undefined;

    const render = async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
        });
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(id, source);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    void render();

    observer = new MutationObserver(() => void render());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [source]);

  if (failed) {
    return <pre className="rp-mermaid rp-mermaid--failed">{source}</pre>;
  }
  return <div className="rp-mermaid" ref={containerRef} />;
}
