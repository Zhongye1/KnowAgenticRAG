import { useNavigate } from 'react-router';

import heroImg from '@/assets/home/hero-ragflow.png';
import { paths } from '@/config/paths';
import { useUser } from '@/lib/auth';

import { GITHUB } from '../content';

export const HomeHero = () => {
  const navigate = useNavigate();
  const user = useUser();

  const handleEnter = () => {
    if (user.data) {
      navigate(paths.app.dashboard.getHref());
    } else {
      navigate(paths.auth.login.getHref(paths.app.root.path));
    }
  };

  return (
    <section className="yx-hero">
      <div className="yx-ambient" aria-hidden="true">
        <span className="yx-orb yx-orb--1"></span>
        <span className="yx-orb yx-orb--3"></span>
        <div className="yx-grid"></div>
      </div>
      <div className="yx-container yx-hero__inner">
        <div className="yx-hero__copy">
          <h1 className="yx-hero__title">
            让知识被智能体
            <br />
            <span className="yx-accent">检索、推理与交付</span>
          </h1>
          <p className="yx-hero__subtitle">可私有部署的多租户知识智能体平台</p>
          <p className="yx-hero__desc">
            在一个工作台中统一文档解析、知识库、RAG 检索、知识图谱与权限管理，
            让每一次回答都有来源、可追溯、可交付。
          </p>
          <div className="yx-hero__actions">
            <button
              type="button"
              className="yx-btn yx-btn--primary"
              onClick={handleEnter}
            >
              在线演示
            </button>
            <a
              className="yx-btn yx-btn--ghost"
              href={GITHUB}
              target="_blank"
              rel="noreferrer"
            >
              项目文档
            </a>
          </div>
        </div>
        <div className="yx-hero__shot">
          <img
            className="yx-hero__img"
            src={heroImg}
            alt="KnowledgeRAG RAG 流程示意图"
            loading="eager"
          />
        </div>
      </div>
    </section>
  );
};
