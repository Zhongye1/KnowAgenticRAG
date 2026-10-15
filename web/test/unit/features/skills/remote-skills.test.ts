/**
 * 远程安装选择规则的用例。
 *
 * 覆盖本地过滤、反选、两种入口合成解析请求（搜索按来源分组）与来源历史。
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  addRepoHistory,
  buildRepoRequests,
  buildSearchRequests,
  filterRepoSkills,
  hitKey,
  invertHitSelection,
  invertRepoSelection,
  isHitSelected,
  readRepoHistory,
  removeRepoHistory,
  remoteSelectionSummary,
  toggleHit,
  writeRepoHistory,
} from '@/features/skills/lib/remote-skills';

beforeEach(() => {
  window.localStorage.clear();
});

describe('仓库内的本地过滤与反选', () => {
  const options = [
    { name: 'web-design', description: '网页设计' },
    { name: 'python-tools', description: '' },
  ];

  it('按 name 与 description 过滤（只看 name 时本用例必须失败）', () => {
    expect(filterRepoSkills(options, 'web').map((item) => item.name)).toEqual([
      'web-design',
    ]);
    expect(filterRepoSkills(options, '设计').map((item) => item.name)).toEqual([
      'web-design',
    ]);
    expect(filterRepoSkills(options, '  ')).toHaveLength(2);
  });

  it('反选只翻转可见范围内的项（对全量反选时本用例必须失败）', () => {
    const visible = filterRepoSkills(options, 'web');
    expect(invertRepoSelection(visible, ['python-tools'])).toEqual([
      'web-design',
    ]);
  });
});

describe('解析请求组装', () => {
  it('按仓库拉取：一次请求，明细跟着选中的项（不带明细时进度项会退化成 slug）', () => {
    const requests = buildRepoRequests(
      'owner/repo',
      ['web-design'],
      [
        { name: 'web-design', description: '网页设计' },
        { name: 'python-tools', description: '' },
      ],
    );
    expect(requests).toEqual([
      {
        source: 'owner/repo',
        skills: ['web-design'],
        skillDetails: [
          { slug: 'web-design', name: 'web-design', description: '网页设计' },
        ],
      },
    ]);
    expect(buildRepoRequests('owner/repo', [], [])).toEqual([]);
  });

  it('全局搜索：按 source 分组，一次请求一个来源（不分组时会把别的来源的 Skill 混进去）', () => {
    const requests = buildSearchRequests([
      { source: 'a/repo', name: 'x', installs: '1K' },
      { source: 'b/repo', name: 'y' },
      { source: 'a/repo', name: 'z' },
    ]);
    expect(requests).toEqual([
      {
        source: 'a/repo',
        skills: ['x', 'z'],
        skillDetails: [
          { slug: 'x', name: 'x', description: '1K' },
          { slug: 'z', name: 'z', description: '' },
        ],
      },
      {
        source: 'b/repo',
        skills: ['y'],
        skillDetails: [{ slug: 'y', name: 'y', description: '' }],
      },
    ]);
  });

  it('搜索结果的身份带来源，勾选与反选都按它判定（只用 name 做身份时同名跨来源会串选）', () => {
    const a = { source: 'a/repo', name: 'same' };
    const b = { source: 'b/repo', name: 'same' };
    expect(hitKey(a)).toBe('a/repo@same');
    expect(isHitSelected([a], b)).toBe(false);
    expect(toggleHit([a], b)).toEqual([a, b]);
    expect(toggleHit([a, b], a)).toEqual([b]);
    expect(invertHitSelection([a, b], [a])).toEqual([b]);
  });
});

describe('摘要与历史', () => {
  it('两个页签各自的空态与计数文案（页签混用时本用例必须失败）', () => {
    expect(remoteSelectionSummary('repo', 0, 0)).toBe('请先拉取仓库中的 Skill');
    expect(remoteSelectionSummary('repo', 3, 2)).toBe(
      '已选 2 / 共发现 3 个 Skill',
    );
    expect(remoteSelectionSummary('search', 0, 0)).toBe(
      '请输入关键词查找 Skill',
    );
    expect(remoteSelectionSummary('search', 4, 1)).toBe(
      '已选 1 / 共找到 4 个 Skill',
    );
  });

  it('历史去重置顶并截断到 10 条（不截断时本用例必须失败）', () => {
    let history: string[] = [];
    for (let index = 0; index < 12; index += 1) {
      history = addRepoHistory(history, `owner/repo-${index}`);
    }
    expect(history).toHaveLength(10);
    expect(history[0]).toBe('owner/repo-11');
    history = addRepoHistory(history, 'owner/repo-5');
    expect(history[0]).toBe('owner/repo-5');
    expect(history).toHaveLength(10);
    expect(addRepoHistory(history, '   ')).toEqual(history);
    expect(removeRepoHistory(history, 'owner/repo-5')).not.toContain(
      'owner/repo-5',
    );
  });

  it('历史读写落在本仓前缀的 key 上，损坏的 JSON 当没有历史', () => {
    window.localStorage.clear();
    expect(readRepoHistory()).toEqual([]);
    writeRepoHistory(['owner/repo']);
    expect(window.localStorage.getItem('ars_skill_remote_repo_history')).toBe(
      '["owner/repo"]',
    );
    expect(readRepoHistory()).toEqual(['owner/repo']);
    window.localStorage.setItem('ars_skill_remote_repo_history', '{oops');
    expect(readRepoHistory()).toEqual([]);
    writeRepoHistory([]);
    expect(
      window.localStorage.getItem('ars_skill_remote_repo_history'),
    ).toBeNull();
  });
});
