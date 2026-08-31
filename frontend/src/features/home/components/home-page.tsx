import { Head } from '@/components/seo';

import '../home.css';
import { HomeCapabilities } from './home-capabilities';
import { HomeCta } from './home-cta';
import { HomeEngine } from './home-engine';
import { HomeHero } from './home-hero';
import { HomeProviders } from './home-providers';
import {
  HomeCases,
  HomeCommunity,
  HomeEnterprise,
  HomeHowItWorks,
  HomeQuickStart,
  HomeShots,
  HomeStats,
  HomeTechStack,
} from './home-sections';
import { NavBar } from '@/components/Navbar';

export const HomePage = () => (
  <>
    <Head
      title="KnowledgeRAG"
      description="可私有部署的多租户知识智能体平台：统一文档解析、知识库、RAG 检索、知识图谱与权限管理。"
    />
    <div className="yx-home">
      <NavBar />
      <HomeHero />
      <HomeStats />
      <HomeCapabilities />
      <HomeEngine />
      <HomeProviders />
      <HomeHowItWorks />
      <HomeShots />
      <HomeEnterprise />
      <HomeCases />
      <HomeTechStack />
      <HomeQuickStart />
      <HomeCommunity />
      <HomeCta />
    </div>
  </>
);
