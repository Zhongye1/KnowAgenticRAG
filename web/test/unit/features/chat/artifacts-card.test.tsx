import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ArtifactsCard } from '@/features/chat/ui/artifacts-card';

const artifacts = [
  { path: '/out/report.md', name: 'report.md' },
  { path: '/out/data.csv', name: 'data.csv' },
];

describe('ArtifactsCard', () => {
  it('渲染全部条目与类型标签', () => {
    render(<ArtifactsCard artifacts={artifacts} threadId="t1" />);
    expect(screen.getByText('report.md')).toBeInTheDocument();
    expect(screen.getByText('data.csv')).toBeInTheDocument();
    expect(screen.getByText('Markdown 文档')).toBeInTheDocument();
  });

  it('没有产物时不渲染', () => {
    const { container } = render(
      <ArtifactsCard artifacts={[]} threadId="t1" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('点击条目打开预览', () => {
    const onOpenPreview = vi.fn();
    render(
      <ArtifactsCard
        artifacts={artifacts}
        threadId="t1"
        onOpenPreview={onOpenPreview}
      />,
    );
    fireEvent.click(screen.getByText('report.md'));
    expect(onOpenPreview).toHaveBeenCalledWith(artifacts[0]);
  });

  it('点击下载按钮触发下载', () => {
    const onDownload = vi.fn();
    render(
      <ArtifactsCard
        artifacts={artifacts}
        threadId="t1"
        onDownload={onDownload}
      />,
    );
    fireEvent.click(screen.getByLabelText('下载 report.md'));
    expect(onDownload).toHaveBeenCalledWith(artifacts[0]);
  });

  it('保存中禁用保存按钮', () => {
    const onSave = vi.fn();
    render(
      <ArtifactsCard
        artifacts={artifacts}
        threadId="t1"
        savingPaths={new Set(['/out/report.md'])}
        onSave={onSave}
      />,
    );
    const saving = screen.getByLabelText('保存 report.md 到个人空间');
    expect(saving).toBeDisabled();
    fireEvent.click(saving);
    expect(onSave).not.toHaveBeenCalled();
    // 其他条目不受影响
    fireEvent.click(screen.getByLabelText('保存 data.csv 到个人空间'));
    expect(onSave).toHaveBeenCalledWith(artifacts[1]);
  });

  it('没有线程时不允许保存', () => {
    render(<ArtifactsCard artifacts={artifacts} threadId={null} />);
    expect(
      screen.getByLabelText('保存 report.md 到个人空间'),
    ).toBeDisabled();
  });
});
