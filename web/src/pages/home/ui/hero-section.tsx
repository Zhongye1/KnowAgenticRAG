/**
 * Hero 段落：左列价值主张 + 右侧粒子 logo 画布。
 *
 * 纯静态陈列，没有跟随指针的光效层。
 */
import { outbound } from '../lib/links';
import { ArkParticleAnimation } from './ArkParticleAnimation';
import { GitHubButton } from './github-button';
import { HeroDataFlow } from './hero-data-flow';

/** 3D 数据图的轮播素材。模块级常量：粒子组件按内容键比较，避免每次渲染重建粒子。 */
const ATLAS_LOGOS = [
  {
    name: 'Rhodes Island',
    url: 'https://pica.zhimg.com/v2-48bf613091109811bbe13f6da90259b6_r.jpg?source=d16d100b',
  },
  // {
  //   name: 'Rhine Lab',
  //   url: 'https://pic2.zhimg.com/v2-32a7736141a4fd7666b0473c0450f82f_r.jpg',
  // },
];

export const HeroSection = () => (
  <section
    id="hero"
    className="hero relative grid overflow-hidden"
    aria-labelledby="hero-title"
  >
    <div className="home-shell relative z-[1] grid grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)] content-center items-center gap-x-[clamp(32px,4vw,72px)] gap-y-10 py-[clamp(56px,6vw,104px)] max-[1024px]:grid-cols-1">
      <div className="hero-copy">
        <h1 id="hero-title" className="home-display home-rule table">
          让智能工作
          <br />
          <span className="matrix-word">
            <span className="matrix-grid" aria-hidden="true">
              <span className="matrix-dots" />
              <span className="matrix-scanline" />
            </span>
            <em>有据可依</em>
          </span>
        </h1>

        <p className="home-lead mt-[clamp(18px,1.8vw,26px)] max-w-[46ch]">
          把文档解析成可检索、可引用的知识，由智能体按需混合检索——每次回答都能回到原文核对。
        </p>

        <HeroDataFlow />

        <div className="mt-[clamp(26px,2.6vw,36px)] flex flex-wrap items-center gap-[22px] max-[721px]:gap-4">
          <a
            className="button button-primary inline-flex min-w-[170px] items-center justify-center gap-2 px-[22px] py-[15px] max-[721px]:w-full"
            href={outbound.docs}
          >
            阅读文档 <span aria-hidden="true">↗</span>
          </a>
          <GitHubButton
            className="button button-quiet inline-flex min-w-[170px] items-center justify-center gap-2 px-[22px] py-[15px] max-[721px]:w-full"
            href={outbound.repo}
          />
        </div>
      </div>

      {/* 3D 数据图：logo 粒子轮播，素材在 public/assets，排在文案右侧 */}
      <div className="hero-atlas flex justify-center">
        <ArkParticleAnimation images={ATLAS_LOGOS} />
      </div>
    </div>
  </section>
);
