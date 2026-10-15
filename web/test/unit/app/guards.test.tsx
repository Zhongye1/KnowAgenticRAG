/**
 * 路由守卫：能力关闭（LITE）与超管区域是体验级约束，只按声明的投影判定。
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { session } = vi.hoisted(() => ({
  session: {
    loading: false,
    data: undefined as unknown,
    isSuperuser: false,
  },
}));

vi.mock('@/entities/session', () => ({
  useCapabilities: () => ({ isLoading: session.loading, data: session.data }),
  useIsSuperuser: () => session.isSuperuser,
}));

const { RequireKnowledgeEnabled, RequireSuperuser } =
  await import('@/app/routing/guards');

/** knowledge=false 的投影：有 data 且 features.knowledge 为 false。 */
const projectionOff = {
  capabilities: { features: { knowledge: false } },
};
const renderKnowledge = () =>
  render(
    <MemoryRouter initialEntries={['/extensions/knowledgebase/kb-1']}>
      <Routes>
        <Route element={<RequireKnowledgeEnabled />}>
          <Route
            path="/extensions/knowledgebase/:kbId"
            element={<div>知识库页</div>}
          />
        </Route>
        <Route path="/agent" element={<div>对话页</div>} />
      </Routes>
    </MemoryRouter>,
  );

const renderSuperuser = () =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route element={<RequireSuperuser />}>
          <Route path="/dashboard" element={<div>数据总览页</div>} />
        </Route>
        <Route path="/agent" element={<div>对话页</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('RequireKnowledgeEnabled', () => {
  beforeEach(() => {
    session.loading = false;
    session.data = undefined;
    session.isSuperuser = false;
  });

  it('能力明确关闭时重定向到对话页，不渲染知识库页', () => {
    session.data = projectionOff;
    renderKnowledge();

    expect(screen.getByText('对话页')).toBeInTheDocument();
    expect(screen.queryByText('知识库页')).not.toBeInTheDocument();
  });

  it('投影未取到时等待，不渲染页面也不重定向', () => {
    session.loading = true;
    renderKnowledge();

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('知识库页')).not.toBeInTheDocument();
    expect(screen.queryByText('对话页')).not.toBeInTheDocument();
  });

  it('能力开启时渲染知识库页', () => {
    session.data = { capabilities: { features: { knowledge: true } } };
    renderKnowledge();

    expect(screen.getByText('知识库页')).toBeInTheDocument();
    expect(screen.queryByText('对话页')).not.toBeInTheDocument();
  });

  it('投影请求失败不作为能力关闭信号，仍渲染页面让故障显式暴露', () => {
    // discovery 失败的形状：isLoading=false 且 data 为 undefined
    session.loading = false;
    session.data = undefined;
    renderKnowledge();

    expect(screen.getByText('知识库页')).toBeInTheDocument();
    expect(screen.queryByText('对话页')).not.toBeInTheDocument();
  });
});

describe('RequireSuperuser', () => {
  beforeEach(() => {
    session.isSuperuser = false;
  });

  it('超管放行', () => {
    session.isSuperuser = true;
    renderSuperuser();

    expect(screen.getByText('数据总览页')).toBeInTheDocument();
  });

  it('非超管重定向到对话页', () => {
    renderSuperuser();

    expect(screen.getByText('对话页')).toBeInTheDocument();
    expect(screen.queryByText('数据总览页')).not.toBeInTheDocument();
  });
});
