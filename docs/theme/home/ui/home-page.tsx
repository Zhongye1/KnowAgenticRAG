/**
 * 文档站首页：静态展示页，SPA 首页（web/src/pages/home）的移植版。
 *
 * 展示数据（能力清单、任务链、集成渠道、厂商）就地硬编码在各段组件里，页面不读
 * 后端接口，也没有加载/失败三态。与 SPA 版的差别只有站点相关的两处：顶栏没有会话
 * 入口（文档站没有登录态），站内链接改指文档页面。皮肤与 token 与 SPA 共用
 * web/src/styles 下的同一份 CSS。
 */
import { DeploymentSection } from './deployment-section';
import { HeroSection } from './hero-section';
import { IntegrationSection } from './integration-section';
import { KnowledgeWorkSection } from './knowledge-work-section';
import { MouseTrail } from './mouse-trail';
import { RagPipelineSection } from './rag-pipeline-section';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import { TaskChainSection } from './task-chain-section';

export const HomePage = () => (
  <div className="home-site">
    <MouseTrail />
    <SiteHeader />
    <main id="main-content">
      <HeroSection />
      <TaskChainSection />
      <KnowledgeWorkSection />
      <RagPipelineSection />

      <IntegrationSection />
      <DeploymentSection />
    </main>
    <SiteFooter />
  </div>
);
