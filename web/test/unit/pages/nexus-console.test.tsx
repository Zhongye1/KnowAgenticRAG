/**
 * NexusConsole 的交互契约：标签切换与端点复制。
 *
 * 端点串钉住本仓事实（API 走 `POST /api/agent/runs`、CLI 走 `ars-cli`），
 * MCP 那一页仍是照搬参照的展示文案，属待定稿。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { NexusConsole } = await import('@/pages/home/ui/nexus-console');

const mockClipboard = () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  return writeText;
};

describe('NexusConsole', () => {
  beforeEach(() => {
    mockClipboard();
  });

  it('默认展示 MCP 接入方式', () => {
    render(<NexusConsole />);

    expect(screen.getByText('MCP Server Gateway')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'MCP' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('切换标签后换成对应接入方式，旧内容不再渲染', () => {
    render(<NexusConsole />);

    fireEvent.click(screen.getByRole('button', { name: 'API' }));

    expect(screen.getByText('Structured HTTP API')).toBeInTheDocument();
    expect(screen.queryByText('MCP Server Gateway')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'API' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('API 标签展示本仓的运行端点与鉴权方式', () => {
    render(<NexusConsole />);

    fireEvent.click(screen.getByRole('button', { name: 'API' }));

    // 端点串在规格行与展示串里各出现一次，这里用示例代码钉住运行路径
    expect(
      screen.getByText(
        /curl -X POST "https:\/\/<your-instance>\/api\/agent\/runs"/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Authorization: Bearer arskey_…'),
    ).toBeInTheDocument();
  });

  it('复制按钮写入当前端点并回显 Copied', async () => {
    const writeText = mockClipboard();
    render(<NexusConsole />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy endpoint' }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('https://mcp.ausvector.ai/mcp'),
    );
    expect(
      await screen.findByRole('button', { name: 'Copied' }),
    ).toBeInTheDocument();
  });

  it('切到 CLI 后复制的是 CLI 的安装命令，且传输层不是 stdio', async () => {
    const writeText = mockClipboard();
    render(<NexusConsole />);

    fireEvent.click(screen.getByRole('button', { name: 'CLI' }));
    // 本仓 CLI 是用 httpx 调远端实例的 HTTP 客户端：调用形态与传输层都不能写成 stdio
    expect(screen.getByText('ars <command>')).toBeInTheDocument();
    expect(
      screen.getByText('TRANSPORT: HTTP(S) → REMOTE INSTANCE'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/STDIO/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy endpoint' }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('uv tool install ars-cli'),
    );
  });
});
