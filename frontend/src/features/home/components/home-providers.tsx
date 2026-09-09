import { providersBottom, providersTop } from '../content';
import { Reveal } from './reveal';

export const HomeProviders = () => (
  <section className="yx-section">
    <div className="yx-container">
      <Reveal className="yx-head">
        <span className="yx-head__eyebrow">模型供应商</span>
        <h2 className="yx-head__title">一处接入，随处切换</h2>
        <p className="yx-head__sub">
          统一 <code>provider_id:model_id</code>{' '}
          配置，覆盖主流模型供应商，并支持自定义 provider。
        </p>
      </Reveal>
      <Reveal className="yx-marquee">
        <div className="yx-marquee__row">
          <div className="yx-marquee__track">
            {providersTop.map((p, i) => (
              <div key={`t${i}`} className="yx-mq-item">
                <img src={p.icon} alt={p.name} loading="lazy" />
                <span>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="yx-marquee__row yx-marquee__row--rev">
          <div className="yx-marquee__track">
            {providersBottom.map((p, i) => (
              <div key={`b${i}`} className="yx-mq-item">
                <img src={p.icon} alt={p.name} loading="lazy" />
                <span>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </div>
  </section>
);
