/**
 * Hero 段落：内容照搬参照实现的 `hero-section.tsx`。
 *
 * 与参照的差异：不渲染 `HeroViewSwitcher`（依赖 atlas 视图）；3D 数据图换成用户提供的
 * logo 粒子轮播（`ArkParticleAnimation`，素材在 `public/assets`）；两个 CTA 的链接指向
 * 本仓文档站与页内锚点。
 *
 * 来源：AI Website Cloner Template 0.6.1（MIT，JCodesMore）里的 AusVector 首页克隆。
 */
import * as React from 'react';

import { outbound } from '../lib/links';
import { ArkParticleAnimation } from './ArkParticleAnimation';
import { HeroDataFlow } from './hero-data-flow';

/** 3D 数据图的轮播素材。模块级常量：粒子组件按内容键比较，避免每次渲染重建粒子。 */
const ATLAS_LOGOS = [
  { name: 'Rhodes Island', url: '/assets/logo_rhodes.png' },
  { name: 'Rhine Lab', url: '/assets/logo_rhine.png' },
];

export const HeroSection = () => {
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const spotlightRef = React.useRef<HTMLDivElement | null>(null);
  const [rasterHovered, setRasterHovered] = React.useState(false);

  // 缓动跟随指针的高光；窄屏与 prefers-reduced-motion 下不启用
  React.useEffect(() => {
    const stage = stageRef.current;
    const spotlight = spotlightRef.current;
    if (!stage || !spotlight) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(min-width: 721px)').matches) return;

    let targetX = 50;
    let targetY = 50;
    let currentX = 50;
    let currentY = 50;
    let frame = 0;

    const onPointerMove = (event: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      targetX = ((event.clientX - rect.left) / rect.width) * 100;
      targetY = ((event.clientY - rect.top) / rect.height) * 100;
    };

    const tick = () => {
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;
      spotlight.style.setProperty('--pointer-x', `${currentX.toFixed(2)}%`);
      spotlight.style.setProperty('--pointer-y', `${currentY.toFixed(2)}%`);
      frame = requestAnimationFrame(tick);
    };

    stage.addEventListener('pointermove', onPointerMove);
    frame = requestAnimationFrame(tick);
    return () => {
      stage.removeEventListener('pointermove', onPointerMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section
      id="hero-section"
      className="hero-section"
      aria-labelledby="hero-title"
    >
      <div className="hero-pointer-stage" ref={stageRef}>
        <div
          className="hero-pointer-spotlight"
          aria-hidden="true"
          ref={spotlightRef}
        />
        <div className="site-shell hero-shell">
          <section className="hero-grid" aria-labelledby="hero-title">
            <div className="hero-copy">
              <h1 id="hero-title">
                Context for
                <br />
                <span className="matrix-word-anchor">
                  <span
                    className={`matrix-raster-grid ${rasterHovered ? 'is-hovered' : ''}`}
                    aria-hidden="true"
                  >
                    <span className="matrix-raster-dots" />
                    <span className="matrix-raster-scanline" />
                  </span>
                  <em
                    className="matrix-word-em"
                    onPointerEnter={() => setRasterHovered(true)}
                    onPointerLeave={() => setRasterHovered(false)}
                  >
                    intelligent
                  </em>
                </span>
                {/* 单个文本节点，避免前导空格被折叠 */}
                {' work.'}
              </h1>

              <p className="hero-description">
                <span className="hero-description-desktop">
                  {
                    'We turn open data into structured, verifiable context for AI workflows, helping ground model responses, reduce hallucinations, and improve factual accuracy.'
                  }
                </span>
                <span className="hero-description-mobile">
                  {
                    'Ground AI in open data for more accurate answers with fewer hallucinations.'
                  }
                </span>
              </p>

              <HeroDataFlow />

              <div className="hero-actions">
                <a className="button button-primary" href={outbound.docs}>
                  Read the docs <span aria-hidden="true">↗</span>
                </a>
                <a className="button button-quiet" href="#endpoint">
                  View endpoint <span aria-hidden="true">↓</span>
                </a>
              </div>
            </div>

            {/* 3D 数据图：logo 粒子轮播，素材在 public/assets，排在文案右侧 */}
            <div className="hero-atlas">
              <ArkParticleAnimation images={ATLAS_LOGOS} />
            </div>
          </section>
        </div>
      </div>
    </section>
  );
};
