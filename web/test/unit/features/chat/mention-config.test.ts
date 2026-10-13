import { describe, expect, it } from 'vitest';

import { DEFAULT_ALL_RESOURCE_KINDS } from '@/features/chat/lib/agent-config';
import {
  buildMentionConfig,
  MENTION_RESOURCE_KINDS,
} from '@/features/chat/lib/mention-config';
import { buildMentionResourceItems } from '@/features/chat/lib/mention-resources';

/** 后端 `get_configurable_items` 下发的配置项形状；取自 `GET /api/agent/{id}` 的实测响应。 */
const item = (
  kind: string,
  options: Array<Record<string, unknown>> = [],
  overrides: Record<string, unknown> = {},
) => ({ kind, type: 'list', name: kind, options, default: null, description: '', ...overrides });

const option = (key: string, name?: string, description = '') => ({
  key,
  name: name ?? key,
  description,
});

describe('buildMentionConfig', () => {
  it('配置值为 null 时该种类的全部可选项参与', () => {
    const config = buildMentionConfig({
      configurableItems: {
        skills: item('skills', [option('retrieve', '检索'), option('ocr', 'OCR')]),
        subagents: item('subagents', [option('deep-research', '深度研究')]),
      },
      agentConfig: { skills: null, subagents: null },
    });

    expect(config.skills).toEqual([
      { slug: 'retrieve', name: '检索', description: '' },
      { slug: 'ocr', name: 'OCR', description: '' },
    ]);
    expect(config.subagents).toEqual([
      { id: 'deep-research', slug: 'deep-research', name: '深度研究', description: '' },
    ]);
  });

  it('没存过的配置项先补默认值，因此仍然是「全部」', () => {
    const configurableItems = {
      skills: item('skills', [option('retrieve', '检索')]),
    };

    // 后端存下来的只有被改过的项；空 context 不能读成「一个都不选」
    expect(buildMentionConfig({ configurableItems, agentConfig: {} }).skills).toEqual([
      { slug: 'retrieve', name: '检索', description: '' },
    ]);
    expect(buildMentionConfig({ configurableItems }).skills).toHaveLength(1);
  });

  it('配置值是数组时只取数组里的项，顺序按配置值', () => {
    const config = buildMentionConfig({
      configurableItems: {
        skills: item('skills', [option('retrieve', '检索'), option('ocr', 'OCR')]),
      },
      agentConfig: { skills: ['ocr', 'retrieve'] },
    });

    expect(config.skills.map((entry) => entry.slug)).toEqual(['ocr', 'retrieve']);
  });

  it('配置值是空数组时该种类没有候选', () => {
    const config = buildMentionConfig({
      configurableItems: { skills: item('skills', [option('retrieve', '检索')]) },
      agentConfig: { skills: [] },
    });

    expect(config.skills).toEqual([]);
  });

  it('子智能体的空数组与 null 同义，列出全部', () => {
    // 后端把 `subagents: []` 归一成 None 并补齐为「当前用户可见的全部」
    // （`_EMPTY_ALL_CONTEXT_FIELDS`，backend/package/ars/agents/context.py）
    const config = buildMentionConfig({
      configurableItems: {
        subagents: item('subagents', [option('fact-verifier', '事实核查员')]),
      },
      agentConfig: { subagents: [] },
    });

    expect(config.subagents).toEqual([
      { id: 'fact-verifier', slug: 'fact-verifier', name: '事实核查员', description: '' },
    ]);
  });

  it('知识库与 MCP 的空数组仍然是一个都不选', () => {
    const config = buildMentionConfig({
      configurableItems: {
        knowledges: item('knowledges', [option('kb-1', '产品文档')]),
        mcps: item('mcps', [option('github', 'GitHub')]),
      },
      agentConfig: { knowledges: [], mcps: [] },
    });

    expect(config.knowledgeBases).toEqual([]);
    expect(config.mcps).toEqual([]);
  });

  it('配置值里出现可选项之外的值时该值被丢掉', () => {
    const config = buildMentionConfig({
      configurableItems: { skills: item('skills', [option('retrieve', '检索')]) },
      agentConfig: { skills: ['retrieve', 'not-in-options'] },
    });

    expect(config.skills.map((entry) => entry.slug)).toEqual(['retrieve']);
  });

  it('同一 kind 来自多个配置项时合并可选项，同值后者覆盖', () => {
    const config = buildMentionConfig({
      configurableItems: {
        skills: item('skills', [option('retrieve', '旧名字')]),
        preload_skills: item('skills', [option('retrieve', '新名字'), option('ocr', 'OCR')]),
      },
      agentConfig: { skills: null, preload_skills: [] },
    });

    expect(config.skills).toEqual([
      { slug: 'retrieve', name: '新名字', description: '' },
      { slug: 'ocr', name: 'OCR', description: '' },
    ]);
  });

  it('配置项没有 kind 时按配置键名判定', () => {
    const config = buildMentionConfig({
      configurableItems: { mcps: { options: [option('github', 'GitHub')], default: null } },
      agentConfig: { mcps: null },
    });

    expect(config.mcps).toEqual([{ slug: 'github', name: 'GitHub', description: '' }]);
  });

  it('知识库候选带 kb_id，值是 kb_id 而不是名称', () => {
    const config = buildMentionConfig({
      configurableItems: {
        knowledges: item('knowledges', [option('kb-1', '产品文档', '说明')]),
      },
      agentConfig: { knowledges: null },
    });

    expect(config.knowledgeBases).toEqual([
      { kb_id: 'kb-1', name: '产品文档', description: '说明' },
    ]);
    // 与候选归一串联后：令牌写名称，资源标识仍是 kb_id
    expect(buildMentionResourceItems(config).knowledgeBases[0]).toMatchObject({
      value: '产品文档',
      tokenLabel: '@knowledge:产品文档',
      resourceId: 'kb-1',
    });
  });

  it('可选项没有任何标识字段时丢掉，不会产生空令牌', () => {
    const config = buildMentionConfig({
      configurableItems: {
        skills: item('skills', [
          { key: '', name: '', description: '' },
          option('retrieve', '检索'),
        ]),
      },
      agentConfig: { skills: null },
    });

    expect(config.skills).toEqual([{ slug: 'retrieve', name: '检索', description: '' }]);
  });

  it('可选项缺 key 时退到 name 当标识', () => {
    // 与参照的 getAgentConfigOptionValue 同序：key → id → value → name → …
    const config = buildMentionConfig({
      configurableItems: { skills: item('skills', [{ name: '只有名字' }]) },
      agentConfig: { skills: null },
    });

    expect(config.skills).toEqual([{ slug: '只有名字', name: '只有名字', description: '' }]);
  });

  it('options 不是数组时该配置项不贡献候选', () => {
    const config = buildMentionConfig({
      configurableItems: {
        skills: { kind: 'skills', options: { retrieve: '检索' }, default: null },
      },
      agentConfig: { skills: null },
    });

    expect(config.skills).toEqual([]);
  });

  it('形状不符的输入不抛错，四类都返回空数组', () => {
    for (const input of [
      {},
      { configurableItems: null, agentConfig: null },
      { configurableItems: ['skills'], agentConfig: 'nope' },
      { configurableItems: { skills: 'nope' }, agentConfig: { skills: 'nope' } },
    ]) {
      expect(buildMentionConfig(input)).toEqual({
        knowledgeBases: [],
        mcps: [],
        skills: [],
        subagents: [],
      });
    }
  });

  it('不改变入参', () => {
    const agentConfig = { skills: null };
    const configurableItems = { skills: item('skills', [option('retrieve', '检索')]) };

    buildMentionConfig({ configurableItems, agentConfig });

    expect(agentConfig).toEqual({ skills: null });
    expect(configurableItems.skills.options).toHaveLength(1);
  });

  it('「默认全部」的种类集合覆盖四项提及种类', () => {
    expect(DEFAULT_ALL_RESOURCE_KINDS).toContain('tools');
    for (const kind of MENTION_RESOURCE_KINDS) {
      expect(DEFAULT_ALL_RESOURCE_KINDS).toContain(kind);
    }
  });
});
