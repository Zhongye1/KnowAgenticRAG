import { describe, expect, it } from 'vitest';

import type { ChatMessage, ChatToolCall } from '@/features/chat/api/agent-api';
import {
  artifactMetaLabel,
  extractArtifactsFromConversation,
  normalizeArtifactItems,
} from '@/features/chat/lib/artifacts';
import type { Conversation } from '@/features/chat/lib/message-processor';

const aiMessage = (toolCalls: ChatToolCall[]): ChatMessage => ({
  id: 1,
  type: 'ai',
  content: '',
  tool_calls: toolCalls,
});

const presentCall = (overrides: Partial<ChatToolCall> = {}): ChatToolCall => ({
  id: 'call-1',
  name: 'present_artifacts',
  args: { filepaths: ['/out/report.md'] },
  tool_call_result: { content: 'ok' },
  ...overrides,
});

const conversation = (messages: ChatMessage[]): Conversation => ({
  messages,
  status: 'finished',
});

describe('extractArtifactsFromConversation', () => {
  it('提取成功调用的去重路径', () => {
    const artifacts = extractArtifactsFromConversation(
      conversation([
        aiMessage([
          presentCall({ args: { filepaths: ['/out/a.md', '/out/b.md'] } }),
          presentCall({ args: { filepaths: ['/out/a.md', '/out/c.md'] } }),
        ]),
      ]),
    );
    expect(artifacts).toEqual(['/out/a.md', '/out/b.md', '/out/c.md']);
  });

  it('丢弃没有结果的调用', () => {
    const artifacts = extractArtifactsFromConversation(
      conversation([
        aiMessage([presentCall({ tool_call_result: null })]),
      ]),
    );
    expect(artifacts).toEqual([]);
  });

  it('状态 success 但结果缺失时算交付', () => {
    const artifacts = extractArtifactsFromConversation(
      conversation([
        aiMessage([presentCall({ tool_call_result: null, status: 'success' })]),
      ]),
    );
    expect(artifacts).toEqual(['/out/report.md']);
  });

  it('解析不出 JSON 参数时跳过该调用', () => {
    const artifacts = extractArtifactsFromConversation(
      conversation([
        aiMessage([
          presentCall({
            args: undefined,
            function: { name: 'present_artifacts', arguments: '{oops' },
          }),
        ]),
      ]),
    );
    expect(artifacts).toEqual([]);
  });

  it('丢弃空白与非字符串路径', () => {
    const artifacts = extractArtifactsFromConversation(
      conversation([
        aiMessage([
          presentCall({ args: { filepaths: ['  ', 42, '/out/ok.md'] } }),
        ]),
      ]),
    );
    expect(artifacts).toEqual(['/out/ok.md']);
  });

  it('空对话与空消息返回空数组', () => {
    expect(extractArtifactsFromConversation(null)).toEqual([]);
    expect(extractArtifactsFromConversation(conversation([]))).toEqual([]);
  });

  it('不认非 AI 消息与其他工具', () => {
    const artifacts = extractArtifactsFromConversation(
      conversation([
        {
          id: 2,
          type: 'human',
          content: '',
          tool_calls: [presentCall()],
        },
        aiMessage([
          { id: 'c2', name: 'write_file', args: { filepaths: ['/x'] }, tool_call_result: { content: 'ok' } },
        ]),
      ]),
    );
    expect(artifacts).toEqual([]);
  });
});

describe('normalizeArtifactItems', () => {
  it('归一路径与文件名', () => {
    expect(normalizeArtifactItems(['/out/报告.md', '/out/报告.md'])).toEqual([
      { path: '/out/报告.md', name: '报告.md' },
    ]);
  });

  it('没有可识别文件名时用整段路径兜底', () => {
    expect(normalizeArtifactItems(['/'])).toEqual([]);
    expect(normalizeArtifactItems(['x'])).toEqual([{ path: 'x', name: 'x' }]);
  });
});

describe('artifactMetaLabel', () => {
  it('按扩展名给标签', () => {
    expect(artifactMetaLabel('/out/report.md')).toBe('Markdown 文档');
    expect(artifactMetaLabel('/out/a.CSV')).toBe('CSV 表格');
    expect(artifactMetaLabel('/out/pic.webp')).toBe('交付文件 · WEBP');
  });

  it('没有扩展名时是交付文件', () => {
    expect(artifactMetaLabel('/out/README')).toBe('交付文件');
  });
});
