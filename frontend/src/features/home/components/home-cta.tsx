import { useNavigate } from 'react-router';

import { paths } from '@/config/paths';
import { useUser } from '@/lib/auth';

import { GITHUB } from '../content';
import { Reveal } from './reveal';

export const HomeCta = () => {
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
    <section className="yx-cta">
      <Reveal className="yx-container yx-cta__inner">
        <h2>把知识接入真正能执行的智能体</h2>
        <p>从快速开始到完整部署，按需启用解析、检索、知识图谱与权限能力。</p>
        <div className="yx-hero__actions yx-cta__actions">
          <button type="button" className="yx-btn yx-btn--primary" onClick={handleEnter}>
            {user.data ? '进入工作台' : '登录 / 注册'}
          </button>
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
