import {
  cases,
  credits,
  enterprise,
  GITHUB,
  quickStartCode,
  shots,
  stats,
  steps,
  techStack,
} from '../content';
import { FeatureIcon } from './icons';
import { Reveal } from './reveal';

export const HomeStats = () => (
  <section className="yx-stats">
    <div className="yx-container yx-stats__inner">
      {stats.map((s) => (
        <div key={s.label} className="yx-stat">
          <div className="yx-stat__value">{s.value}</div>
          <div className="yx-stat__label">{s.label}</div>
        </div>
      ))}
    </div>
  </section>
);

export const HomeHowItWorks = () => (
  <section className="yx-section yx-section--soft">
    <div className="yx-container">
      <Reveal className="yx-head">
        <span className="yx-head__eyebrow">工作原理</span>
        <h2 className="yx-head__title">四步搭建你的智能体应用</h2>
      </Reveal>
      <div className="yx-steps">
        {steps.map((st, i) => (
          <Reveal key={st.n}>
            <div className="yx-step">
              <div className="yx-step__n">{st.n}</div>
              <h3 className="yx-step__title">{st.title}</h3>
              <p className="yx-step__desc">{st.desc}</p>
              {i < steps.length - 1 && (
                <span className="yx-step__arrow" aria-hidden="true">
                  →
                </span>
              )}
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);

export const HomeShots = () => (
  <section className="yx-section">
    <div className="yx-container">
      <Reveal className="yx-head">
        <span className="yx-head__eyebrow">产品一览</span>
        <h2 className="yx-head__title">一个工作台，覆盖全流程</h2>
      </Reveal>
      <div className="yx-shots">
        {shots.map((sh) => (
          <Reveal key={sh.title}>
            <figure className="yx-shot">
              <div className="yx-placeholder">
                <span>{sh.title} · 预览</span>
              </div>
              <figcaption>
                <strong>{sh.title}</strong>
                <span>{sh.desc}</span>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);

export const HomeEnterprise = () => (
  <section className="yx-section yx-section--soft">
    <div className="yx-container">
      <Reveal className="yx-head">
        <span className="yx-head__eyebrow">企业级与可集成</span>
        <h2 className="yx-head__title">从原型验证到团队落地</h2>
      </Reveal>
      <div className="yx-cards3">
        {enterprise.map((e) => (
          <Reveal key={e.title}>
            <article className="yx-card">
              <span className="yx-cap__icon" aria-hidden="true">
                <FeatureIcon name={e.icon} />
              </span>
              <h3>{e.title}</h3>
              <p>{e.desc}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);

export const HomeCases = () => (
  <section className="yx-section">
    <div className="yx-container">
      <Reveal className="yx-head">
        <span className="yx-head__eyebrow">应用场景</span>
        <h2 className="yx-head__title">适配你的真实业务</h2>
      </Reveal>
      <div className="yx-cards3">
        {cases.map((c) => (
          <Reveal key={c.title}>
            <article className="yx-card yx-card--case">
              <h3>{c.title}</h3>
              <p>{c.desc}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);

export const HomeTechStack = () => (
  <section className="yx-section yx-section--soft">
    <div className="yx-container">
      <Reveal className="yx-head">
        <span className="yx-head__eyebrow">技术栈</span>
        <h2 className="yx-head__title">现代而稳健的工程基座</h2>
      </Reveal>
      <div className="yx-tech">
        {techStack.map((t) => (
          <Reveal key={t.group}>
            <div className="yx-tech__row">
              <div className="yx-tech__group">{t.group}</div>
              <div className="yx-tech__items">
                {t.items.map((item) => (
                  <span key={item} className="yx-chip">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);

const CodeLine = ({ line }: { line: string }) => {
  const isComment = line.trimStart().startsWith('#');
  return (
    <div>
      {isComment ? (
        <span className="yx-c-cmt">{line}</span>
      ) : (
        <span>{line}</span>
      )}
    </div>
  );
};

export const HomeQuickStart = () => (
  <section className="yx-section">
    <div className="yx-container">
      <Reveal className="yx-head">
        <span className="yx-head__eyebrow">快速开始</span>
        <h2 className="yx-head__title">三步本地跑起来</h2>
      </Reveal>
      <Reveal className="yx-quick">
        <pre className="yx-code">
          <code>
            {quickStartCode.split('\n').map((line, i) => (
              <CodeLine key={i} line={line} />
            ))}
          </code>
        </pre>
        <p className="yx-quick__tip">完整部署与配置方式见「工程治理 → 构建与部署」文档。</p>
      </Reveal>
    </div>
  </section>
);

export const HomeCommunity = () => (
  <section className="yx-section yx-section--soft">
    <div className="yx-container yx-center">
      <Reveal className="yx-head">
        <span className="yx-head__eyebrow">社区</span>
        <h2 className="yx-head__title">由开源社区共同构建</h2>
      </Reveal>
      <Reveal>
        <a
          href={`${GITHUB}/graphs/contributors`}
          target="_blank"
          rel="noreferrer"
          className="yx-contrib"
        >
          <img
            src="https://contrib.rocks/image?repo=Zhongye1/KnowledgeRAG-GZHU&max=60&columns=12"
            alt="KnowledgeRAG 贡献者头像墙"
            loading="lazy"
          />
        </a>
      </Reveal>
      <Reveal>
        <p className="yx-credits">
          站在巨人的肩上 ——
          {credits.map((c, i) => (
            <span key={c.name}>
              <a href={c.url} target="_blank" rel="noreferrer">
                {c.name}
              </a>
              {i < credits.length - 1 && ' · '}
            </span>
          ))}
        </p>
      </Reveal>
    </div>
  </section>
);
