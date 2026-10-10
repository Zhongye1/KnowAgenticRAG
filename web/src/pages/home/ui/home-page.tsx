/**
 * 首页。
 *
 * 视觉与文案基准是 AusVector 首页克隆（本迁移里唯一不向 Yuxi 对齐的页面，见 tracked
 * 决策记录 `2026-10-11-web-antd-yuxi-alignment.md`）；三态沿用 Yuxi `HomeView.vue`
 * 的行为契约：先健康检查、通过后才加载配置，失败进错误态并可重试。
 */
import { useHomeBranding, useSystemHealth, useUser } from '@/entities/session';

import { outbound } from '../lib/links';
import { CapabilitySection } from './capability-section';
import { ContextSection } from './context-section';
import { EndpointSection } from './endpoint-section';
import { HeroSection } from './hero-section';
import { MetricsHorizon } from './metrics-horizon';
import { MouseTrail } from './mouse-trail';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

export const HomePage = () => {
  const health = useSystemHealth();
  const healthOk = health.data?.status === 'ok';
  // 健康检查通过才加载配置：失败时不发配置请求，错误态因此不会被配置结果覆盖
  const branding = useHomeBranding({ enabled: healthOk });
  const user = useUser();

  if (health.isLoading) {
    return (
      <div className="home-site home-state">
        <div className="home-state-spinner" aria-hidden="true" />
        <p className="home-state-message">正在连接服务...</p>
      </div>
    );
  }

  if (health.isError || (health.data !== undefined && !healthOk)) {
    const message = health.isError
      ? health.error instanceof Error
        ? health.error.message
        : '后端服务无法响应，请检查服务是否正常运行'
      : health.data?.message || '后端服务无法响应，请检查服务是否正常运行';

    return (
      <div className="home-site home-state">
        <h1 className="home-state-title">服务连接失败</h1>
        <p className="home-state-message">{message}</p>
        <div className="home-state-actions">
          <button
            type="button"
            className="button button-primary"
            onClick={() => void health.refetch()}
          >
            重试
          </button>
          <a className="button button-quiet" href={outbound.docs}>
            常见问题
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="home-site">
      <MouseTrail />
      <SiteHeader
        brandName={branding.brandName}
        logo={branding.logo}
        isLoggedIn={Boolean(user.data)}
      />
      <main id="main-content">
        <HeroSection />
        <MetricsHorizon />
        <EndpointSection />
        <CapabilitySection />
        <ContextSection />
      </main>
      <SiteFooter />
    </div>
  );
};
