import { describe, expect, it } from 'vitest';

import {
  buildElapsedLabel,
  buildReplyLoadingStatus,
} from '@/features/chat/lib/reply-status';

describe('buildReplyLoadingStatus', () => {
  it('默认是「正在生成回复...」', () => {
    expect(
      buildReplyLoadingStatus({
        replyLoadingVisible: true,
        contextCompressing: false,
        queuePaused: false,
        queuedCount: 0,
      }),
    ).toEqual({ visible: true, text: '正在生成回复...' });
  });

  it('压缩上下文优先于排队', () => {
    expect(
      buildReplyLoadingStatus({
        replyLoadingVisible: true,
        contextCompressing: true,
        queuePaused: false,
        queuedCount: 2,
      }),
    ).toEqual({ visible: true, text: '正在压缩上下文...' });
  });

  it('排队中带条数', () => {
    expect(
      buildReplyLoadingStatus({
        replyLoadingVisible: true,
        contextCompressing: false,
        queuePaused: false,
        queuedCount: 3,
      }),
    ).toEqual({ visible: true, text: '排队中（3 条）...' });
  });

  it('队列暂停时不显示，让位给队列条', () => {
    expect(
      buildReplyLoadingStatus({
        replyLoadingVisible: true,
        contextCompressing: false,
        queuePaused: true,
        queuedCount: 1,
      }).visible,
    ).toBe(false);
  });

  it('不可见时不显示', () => {
    expect(
      buildReplyLoadingStatus({
        replyLoadingVisible: false,
        contextCompressing: false,
        queuePaused: false,
        queuedCount: 0,
      }).visible,
    ).toBe(false);
  });
});

describe('buildElapsedLabel', () => {
  it('60 秒内是 Ns，之后是 N分Ms，非正数不显示', () => {
    expect(buildElapsedLabel(0)).toBe('');
    expect(buildElapsedLabel(45)).toBe('45s');
    expect(buildElapsedLabel(60)).toBe('1分0s');
    expect(buildElapsedLabel(125)).toBe('2分5s');
    expect(buildElapsedLabel(-1)).toBe('');
  });
});
