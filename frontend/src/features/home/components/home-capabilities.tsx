import { capabilities } from '../content';
import { FeatureIcon } from './icons';
import { Reveal } from './reveal';

export const HomeCapabilities = () => (
  <section className="yx-section">
    <div className="yx-container">
      <Reveal className="yx-head">
        <span className="yx-head__eyebrow">智能体运行时</span>
        <h2 className="yx-head__title">不止于对话，更能执行与交付</h2>
        <p className="yx-head__sub">
          KnowledgeRAG 内置一套完整的运行时——解析、检索、技能与中间件编排，让智能体真正动手完成任务。
        </p>
      </Reveal>
      <div className="yx-bento">
        {capabilities.map((cap) => (
          <Reveal key={cap.title}>
            <article className="yx-cap">
              <span className="yx-cap__icon">
                <FeatureIcon name={cap.icon} />
              </span>
              <h3 className="yx-cap__title">{cap.title}</h3>
              <p className="yx-cap__desc">{cap.desc}</p>
              <div className="yx-cap__tags">
                {cap.tags.map((tag) => (
                  <span key={tag} className="yx-tag">
                    {tag}
                  </span>
                ))}
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);
