import { useState } from 'react';

import { engineTabs } from '../content';
import { FeatureIcon } from './icons';
import { Reveal } from './reveal';

export const HomeEngine = () => {
  const [activeEngine, setActiveEngine] = useState(0);
  const current = engineTabs[activeEngine];

  return (
    <section className="yx-section yx-section--soft">
      <div className="yx-container yx-split">
        <Reveal className="yx-split__text">
          <span className="yx-head__eyebrow">知识引擎</span>
          <h2 className="yx-head__title">从文档到可推理的知识资产</h2>
          <ul className="yx-tabs">
            {engineTabs.map((tab, i) => (
              <li
                key={tab.key}
                className={`yx-tab${activeEngine === i ? ' yx-tab--active' : ''}`}
                onClick={() => setActiveEngine(i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveEngine(i);
                  }
                }}
                role="tab"
                tabIndex={0}
                aria-selected={activeEngine === i}
              >
                <span className="yx-list__ic" aria-hidden="true">
                  <FeatureIcon name={tab.icon} size={20} />
                </span>
                <div className="yx-tab__body">
                  <strong>{tab.title}</strong>
                  <div className="yx-tab__desc">
                    <p>{tab.desc}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal className="yx-split__media">
          <div className="yx-engine-media">
            {current.shot ? (
              <img
                key={current.key}
                className="yx-engine-frame yx-fade-enter-active"
                src={current.shot}
                alt={current.title}
                loading="lazy"
              />
            ) : (
              <div key={current.key} className="yx-engine-frame yx-engine-ph">
                <span>{current.title} · 预览</span>
              </div>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
};
