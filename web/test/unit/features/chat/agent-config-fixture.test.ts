import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { applyConfigDefaults, readAgentContext } from '@/features/chat/lib/agent-config';
import { buildMentionConfig } from '@/features/chat/lib/mention-config';
import { buildMentionResourceItems } from '@/features/chat/lib/mention-resources';

/**
 * 夹具是 `GET /api/agent/default-chatbot` 的实测响应（只保留提及相关的五个配置项与
 * `config_json`）。它钉住后端下发的形状：配置项带 `kind` / `options` / `default`，
 * 可选项用 `key` 当标识，`config_json.context` 是空的。
 *
 * 形状变了要显式更新这个文件并重新审阅，不要让测试跟着实现漂。
 */
const fixture = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures', 'agent-detail-default-chatbot.json'),
    'utf8',
  ),
) as {
  configurable_items: Record<string, unknown>;
  config_json: unknown;
};

describe('真实后端响应的提及候选', () => {
  const config = buildMentionConfig({
    configurableItems: fixture.configurable_items,
    agentConfig: readAgentContext({ config_json: fixture.config_json }),
  });

  it('空 context 下四项都是「默认全部」，候选来自配置项的可选项', () => {
    // 夹具里 config_json.context 是 {}，四个种类的 default 都是 null → 默认全部
    expect(config.skills.map((entry) => entry.slug)).toEqual([
      'mysql-reporter',
      'knowledge-base',
      'deep-research',
      'html-preview',
      'image-gen',
    ]);
    expect(config.subagents.map((entry) => entry.id)).toEqual([
      'fact-verifier',
      'web-search',
      'research-explorer',
      'general-purpose',
    ]);
  });

  it('该环境没有知识库与 MCP 服务器，两类候选为空而不是抛错', () => {
    expect(config.knowledgeBases).toEqual([]);
    expect(config.mcps).toEqual([]);
  });

  it('skills 与 preload_skills 同 kind，可选项合并后不重复', () => {
    expect(config.skills).toHaveLength(5);
  });

  it('归一后的候选能被编辑器直接使用', () => {
    const items = buildMentionResourceItems(config);

    expect(items.subagents[0]).toMatchObject({
      value: 'fact-verifier',
      label: '事实核查员',
      type: 'subagent',
      tokenLabel: '@subagent:事实核查员',
    });
    expect(items.skills[0]).toMatchObject({
      value: 'mysql-reporter',
      type: 'skill',
      // 展示名里有空格，令牌按参照的规则加引号
      tokenLabel: '@skill:"mysql reporter"',
    });
  });

  it('配置存着具体选择时只列出选中的', () => {
    const selected = buildMentionConfig({
      configurableItems: fixture.configurable_items,
      agentConfig: { skills: ['image-gen'], subagents: ['general-purpose'] },
    });

    expect(selected.skills.map((entry) => entry.slug)).toEqual(['image-gen']);
    expect(selected.skills[0]).toMatchObject({ name: 'image-gen' });
    expect(selected.subagents.map((entry) => entry.id)).toEqual(['general-purpose']);
  });

  it('配置里没写过的种类补默认值后仍是「默认全部」', () => {
    const defaults = applyConfigDefaults(
      fixture.configurable_items,
      readAgentContext({ config_json: fixture.config_json }),
    );

    expect(defaults.skills).toBeNull();
    expect(defaults.subagents).toBeNull();
    expect(defaults.preload_skills).toEqual([]);
  });
});
