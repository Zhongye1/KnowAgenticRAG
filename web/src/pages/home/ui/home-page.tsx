/**
 * 首页：静态展示页。
 *
 * 展示数据（能力清单、任务链、集成渠道、厂商）就地硬编码在各段组件里，页面不读
 * 后端接口，也没有加载/失败三态。唯一读会话的是顶栏入口：登录后换成「进入控制台」，
 * 那是导航去向，不是展示数据。
 */
import { useUser } from '@/entities/session';

import { DeploymentSection } from './deployment-section';
import { HeroSection } from './hero-section';
import { IntegrationSection } from './integration-section';
import { KnowledgeWorkSection } from './knowledge-work-section';
import { MouseTrail } from './mouse-trail';
import { RagPipelineSection } from './rag-pipeline-section';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import { TaskChainSection } from './task-chain-section';

export const HomePage = () => {
  const user = useUser();

  return (
    <div className="home-site">
      <MouseTrail />
      <SiteHeader isLoggedIn={Boolean(user.data)} />
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
};
