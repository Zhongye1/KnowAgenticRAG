/**
 * 安装流纯规则用例。
 *
 * 覆盖五个阶段的判定、草稿摊平、逐项结果并回（含个人安装的 `requested_slug` 匹配）、
 * 失败项的可重试范围与重试分组。变异点写在每个用例名里。
 */
import { describe, expect, it } from 'vitest';

import type { SkillDraft } from '@/features/skills/api/skill-api';
import {
  applyInstallResults,
  canCloseFlow,
  failWaitingItems,
  flattenDraftItems,
  initializeProgressItems,
  installTargetLabel,
  isRetryableFailure,
  phaseStepIndex,
  readyReviewItems,
  resultTitle,
  retryRequests,
  setProgressStatus,
  summarizeInstall,
  toInstallItems,
  type InstallItem,
} from '@/features/skills/lib/install-flow';
import { STEP_LABELS } from '@/features/skills/lib/install-flow';

const draft = (extra: Partial<SkillDraft> = {}): SkillDraft => ({
  draft_id: 'draft-1',
  created_by: 'u-1',
  source_type: 'remote',
  source: 'owner/repo',
  created_at: 0,
  expires_at: 0,
  items: [{ slug: 'alpha', name: 'alpha', description: 'A', success: true }],
  default_share_config: {
    version: 2,
    read_scope: {
      access_level: 'user',
      department_ids: [],
      user_uids: ['u-1'],
    },
    manage_scope: null,
  },
  allowed_access_levels: ['user'],
  ...extra,
});

describe('阶段与可关闭性', () => {
  it('步骤序号：selecting→1、result 与 installing 同为第 4 步', () => {
    expect(STEP_LABELS).toEqual(['选择', '加载', '位置', '完成']);
    expect(phaseStepIndex('selecting')).toBe(0);
    expect(phaseStepIndex('preparing')).toBe(1);
    expect(phaseStepIndex('reviewing')).toBe(2);
    expect(phaseStepIndex('installing')).toBe(3);
    expect(phaseStepIndex('result')).toBe(3);
  });

  it('安装中不可关闭；解析中只有失败后才可关闭（把 canCloseFlow 简化成 phase !== installing 时本用例必须失败）', () => {
    expect(canCloseFlow('installing', false)).toBe(false);
    expect(canCloseFlow('installing', true)).toBe(false);
    expect(canCloseFlow('preparing', false)).toBe(false);
    expect(canCloseFlow('preparing', true)).toBe(true);
    expect(canCloseFlow('reviewing', false)).toBe(true);
    expect(canCloseFlow('result', false)).toBe(true);
  });
});

describe('解析进度', () => {
  it('按请求展开逐项进度，key 带来源；置 active 只影响该来源（丢掉来源判定时本用例必须失败）', () => {
    const items = initializeProgressItems([
      {
        source: 'a/repo',
        skills: ['x', 'y'],
        skillDetails: [{ slug: 'x', name: 'X 技能' }],
      },
      { source: 'b/repo', skills: ['z'] },
    ]);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ name: 'X 技能', status: 'waiting' });
    expect(items[1]).toMatchObject({ name: 'y', description: '' });
    const activated = setProgressStatus(items, 'b/repo', 'active');
    expect(activated.map((item) => item.status)).toEqual([
      'waiting',
      'waiting',
      'active',
    ]);
  });
});

describe('草稿与确认列表', () => {
  it('摊平草稿时带上 draft_id / source / source_type，失败项保留在后端原因上', () => {
    const items = flattenDraftItems([
      draft({
        items: [
          { slug: 'alpha', name: 'alpha', success: true },
          { slug: 'beta', success: false, error: '拉取失败' },
        ],
      }),
    ]);
    expect(items.map((item) => item.key)).toEqual([
      'draft-1:alpha',
      'draft-1:beta',
    ]);
    expect(items[1]).toMatchObject({
      name: 'beta',
      success: false,
      error: '拉取失败',
      source: 'owner/repo',
      source_type: 'remote',
    });
    expect(readyReviewItems(items).map((item) => item.slug)).toEqual(['alpha']);
  });
});

describe('逐项安装结果并回', () => {
  const items = toInstallItems(
    flattenDraftItems([
      draft({
        items: [
          { slug: 'alpha', name: 'alpha', success: true },
          { slug: 'beta', name: 'beta', success: true },
        ],
      }),
    ]),
  );

  it('新装的条目从等待变成功，失败项带上后端原因', () => {
    const next = applyInstallResults(
      items,
      [
        { slug: 'alpha', success: true },
        { slug: 'beta', success: false, error: 'slug 已被占用' },
      ],
      'owner/repo',
    );
    expect(next.map((item) => item.status)).toEqual(['success', 'failed']);
    expect(next[1].error).toBe('slug 已被占用');
  });

  it('个人安装按 requested_slug 匹配：只按 slug 匹配时失败项会留在等待（改回 slug 时本用例必须失败）', () => {
    const personal = toInstallItems(
      flattenDraftItems([
        draft({
          source_type: 'upload',
          source: 'SKILL.md',
          items: [{ slug: 'alpha', name: 'alpha', success: true }],
        }),
      ]),
    );
    const next = applyInstallResults(
      personal,
      [
        {
          slug: 'alpha-2',
          requested_slug: 'alpha',
          success: false,
          error: '无权限',
        },
      ],
      'SKILL.md',
    );
    expect(next[0].status).toBe('failed');
    expect(next[0].error).toBe('无权限');
  });

  it('来源不同的同名条目不会被误标（去掉 source 匹配时本用例必须失败）', () => {
    const next = applyInstallResults(
      items,
      [{ slug: 'alpha', success: true }],
      'other/repo',
    );
    expect(next.every((item) => item.status === 'waiting')).toBe(true);
  });

  it('请求整体失败只收尾仍在等待的项，已完成的保持成功', () => {
    const partially: InstallItem[] = [
      { ...items[0], status: 'success' },
      { ...items[1], status: 'waiting' },
    ];
    const next = failWaitingItems(partially, '后端挂了');
    expect(next.map((item) => item.status)).toEqual(['success', 'failed']);
    expect(next[1].error).toBe('后端挂了');
  });
});

describe('失败重试与结果汇总', () => {
  const failed = (extra: Partial<InstallItem> = {}): InstallItem => ({
    key: 'k',
    draft_id: 'd1',
    source: 'owner/repo',
    source_type: 'remote',
    slug: 'alpha',
    name: 'alpha',
    description: '',
    warnings: [],
    success: true,
    status: 'failed',
    ...extra,
  });

  it('只有远程来源的失败项可重试（把 source_type 判定去掉时本用例必须失败）', () => {
    expect(isRetryableFailure(failed())).toBe(true);
    expect(
      isRetryableFailure(failed({ source_type: 'upload', source: 'SKILL.md' })),
    ).toBe(false);
    // 重试依赖原始来源参数；来源为空时无法重放
    expect(isRetryableFailure(failed({ source: '' }))).toBe(false);
    expect(isRetryableFailure(failed({ status: 'waiting' }))).toBe(false);
  });

  it('重试按来源分组，各自的 slug 不串来源（把来源合并成一次请求时本用例必须失败）', () => {
    const requests = retryRequests([
      failed({ slug: 'a' }),
      failed({ slug: 'b', source: 'other/repo' }),
      failed({ slug: 'c' }),
      failed({ slug: 'd', source_type: 'upload', source: 'SKILL.md' }),
    ]);
    expect(requests).toEqual([
      { source: 'owner/repo', skills: ['a', 'c'] },
      { source: 'other/repo', skills: ['b'] },
    ]);
  });

  it('汇总与结果标题三分支', () => {
    const base = toInstallItems(
      flattenDraftItems([
        draft({
          items: [
            { slug: 'a', success: true },
            { slug: 'b', success: true },
          ],
        }),
      ]),
    );
    expect(summarizeInstall(base)).toEqual({ success: 0, failed: 0 });
    expect(resultTitle(base)).toBe('全部 Skill 安装完成');

    const partial = applyInstallResults(
      base,
      [
        { slug: 'a', success: true },
        { slug: 'b', success: false },
      ],
      'owner/repo',
    );
    expect(summarizeInstall(partial)).toEqual({ success: 1, failed: 1 });
    expect(resultTitle(partial)).toBe('部分 Skill 安装完成');

    const allFailed = applyInstallResults(
      base,
      [{ slug: 'a', success: false }],
      'owner/repo',
    );
    expect(resultTitle(allFailed)).toBe('Skill 安装失败');
  });

  it('安装位置的展示名', () => {
    expect(installTargetLabel('personal')).toBe('个人 Skill');
    expect(installTargetLabel('shared', 'global')).toBe('全局共享');
    expect(installTargetLabel('shared', 'department')).toBe('部门共享');
    expect(installTargetLabel('shared', 'user')).toBe('指定人');
  });
});
