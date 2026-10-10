/**
 * 接口形态段落：内容照搬参照实现的 `endpoint-section.tsx`。
 *
 * 与参照的差异：
 * - `NexusConsole` 的配色改成页面语义类（见 `styles/home-panels.css`）；MCP 那一页的
 *   内容仍照搬参照，API 与 CLI 用本仓事实（见 `../api/access-tabs.ts`）。
 * - 滚动压缩逻辑照搬：滚过 180px 进入紧凑态，回到 80px 以内才恢复。
 * - 卡片链接指向本仓文档站。
 *
 * 来源：AI Website Cloner Template 0.6.1（MIT，JCodesMore）里的 AusVector 首页克隆。
 */
import { useEffect, useState } from 'react';

import { AGENT_RUNTIME_ENDPOINT } from '../api/runtime-endpoint';
import { outbound } from '../lib/links';
import { NexusConsole } from './nexus-console';

const RUNTIME_FEATURES = [
  { title: 'Grounded execution', detail: 'Work from structured open data' },
  { title: 'Traceable outcomes', detail: 'Clear status and run metadata' },
  { title: 'Scoped memory', detail: 'Keep context within each workflow' },
] as const;

export const EndpointSection = () => {
  const [isCondensed, setIsCondensed] = useState(false);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        setIsCondensed((wasCondensed) => y > 180 || (y >= 80 && wasCondensed));
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <div id="endpoint-section">
      <section
        id="endpoint"
        className={`endpoint-band ${isCondensed ? 'is-condensed' : ''}`}
        aria-labelledby="endpoint-title"
      >
        <div className="endpoint-band-inner">
          <div className="endpoint-header-col">
            <h2 id="endpoint-title">
              Multiple ways
              <br />
              <em>to connect.</em>
            </h2>
            <p className="endpoint-subtitle">
              {
                'Choose the access method that fits your workflow: remote MCP, authenticated HTTP API, or CLI. Agent Runtime provides a shared execution layer.'
              }
            </p>
          </div>

          <div className="endpoint-topology">
            <NexusConsole />

            <div className="topology-pipeline" aria-hidden="true">
              <div className="pipeline-line pipeline-left" />
              <div className="pipeline-line pipeline-mid" />
              <div className="pipeline-line pipeline-right" />
            </div>

            <div
              className="topology-runtime"
              aria-label="Agent Runtime execution layer"
            >
              <div className="runtime-main">
                <div className="runtime-headline">
                  <h3>Agent Runtime</h3>
                  <span className="runtime-method">
                    <code>{AGENT_RUNTIME_ENDPOINT}</code>
                  </span>
                </div>
                <p className="runtime-desc">
                  {
                    'A shared execution layer for AI workflows, with explicit outcomes, traceable runs, and scoped memory.'
                  }
                </p>
                <div className="runtime-features">
                  {RUNTIME_FEATURES.map((feature) => (
                    <div className="runtime-feat-item" key={feature.title}>
                      <span className="feat-dot" />
                      <strong>{feature.title}</strong>
                      <span>{feature.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="runtime-cta">
                <a
                  className="copy-button runtime-btn"
                  href={outbound.docsMechanisms}
                >
                  Explore Agent Runtime <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
