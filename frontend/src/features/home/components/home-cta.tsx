import { Link } from 'react-router';

import { paths } from '@/config/paths';
import { useUser } from '@/lib/auth';

import { GITHUB } from '../content';
import { Reveal } from './reveal';

export const HomeCta = () => {
  const user = useUser();

  return (
    <section className="yx-cta">
      <Reveal className="yx-container yx-cta__inner">
        <h2>把知识接入真正能执行的智能体</h2>
        <p>从快速开始到完整部署，按需启用解析、检索、知识图谱与权限能力。</p>
        <div className="yx-hero__actions yx-cta__actions">
          <Link
            to={
              user.data
                ? paths.app.dashboard.getHref()
                : paths.auth.login.getHref(paths.app.root.path)
            }
            viewTransition
            className="yx-btn yx-btn--primary"
          >
            {user.data ? '进入工作台' : '登录 / 注册'}
          </Link>
          <a
            className="yx-btn yx-btn--ghost"
            href={GITHUB}
            target="_blank"
            rel="noreferrer"
          >
            前往 GitHub ★
          </a>
        </div>
      </Reveal>
    </section>
  );
};
