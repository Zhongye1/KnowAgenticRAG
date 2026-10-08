import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { session, knowledge } = vi.hoisted(() => ({
  session: {
    role: 'superadmin' as string | undefined,
    knowledgeEnabled: true as boolean | undefined,
  },
  knowledge: { onOpen: null as null | ((database: { kb_id: string }) => void) },
  // 面板内容由 features 单独测；这里只验证外壳的接线

}));

vi.mock('@/entities/session', () => ({
  useUser: () => ({ data: { role: session.role } }),
  useKnowledgeEnabled: () => session.knowledgeEnabled,
}));

vi.mock('@/features/knowledge-base', () => ({
  KnowledgeList: ({
    onOpen,
  }: {
    onOpen: (database: { kb_id: string }) => void;
  }) => {
    knowledge.onOpen = onOpen;
    return (
      <button type="button" onClick={() => onOpen({ kb_id: 'kb-1' })}>
        列表占位
      </button>
    );
  },
}));

vi.mock('@/shared/ui/content-layout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const { ExtensionsPage } = await import(
  '@/pages/extensions/ui/extensions-page'
);

const LocationProbe = () => <span data-testid="path">{useLocation().pathname}</span>;

const renderPage = () =>
  render(
    <MemoryRouter>
      <ExtensionsPage />
      <LocationProbe />
    </MemoryRouter>,
  );

describe('扩展页外壳', () => {
  beforeEach(() => {
    session.role = 'superadmin';
    session.knowledgeEnabled = true;
    knowledge.onOpen = null;
  });

  it('管理员且知识能力开启时显示知识库 tab 与其面板', async () => {
    renderPage();

    expect(screen.getByRole('button', { name: '知识库' })).toBeTruthy();
    expect(screen.getByText('列表占位')).toBeTruthy();
    expect(screen.getByRole('button', { name: '知识库' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('能力关闭（LITE）时不显示知识库入口，也不发列表请求', () => {
    session.knowledgeEnabled = false;
    renderPage();

    expect(screen.queryByRole('button', { name: '知识库' })).toBeNull();
    expect(screen.queryByText('列表占位')).toBeNull();
    expect(knowledge.onOpen).toBeNull();
  });

  it('能力未知时先不显示，避免首屏闪一下又消失', () => {
    session.knowledgeEnabled = undefined;
    renderPage();

    expect(screen.queryByRole('button', { name: '知识库' })).toBeNull();
  });

  it('admin（非超管）同样能看到知识库与工具入口', () => {
    session.role = 'admin';
    renderPage();

    expect(screen.getByRole('button', { name: '知识库' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '工具' })).toBeTruthy();
  });

  it('普通用户只看到技能，管理员才看到工具与 MCP', () => {
    session.role = 'user';
    renderPage();

    expect(screen.getByRole('button', { name: '技能' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '工具' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'MCP 服务' })).toBeNull();
    expect(screen.queryByRole('button', { name: '知识库' })).toBeNull();
  });

  it('切换 tab 后显示该面板的占位说明，并把 tab 写进地址', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: '技能' }));

    expect(await screen.findByText('该面板随对应分片接入。')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '技能' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('地址里的 ?tab= 决定首屏面板', () => {
    render(
      <MemoryRouter initialEntries={['/extensions?tab=skills']}>
        <ExtensionsPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText('列表占位')).toBeNull();
  });

  it('选中知识库后跳转到详情地址', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: '列表占位' }));

    expect(screen.getByTestId('path')).toHaveTextContent(
      '/extensions/knowledgebase/kb-1',
    );
  });
});
