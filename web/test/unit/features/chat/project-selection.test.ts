import { describe, expect, it } from 'vitest';

import type { ProjectItem } from '@/features/chat/api/projects-api';
import {
  AUTO_PROJECT_ID,
  canCreateProject,
  filterProjects,
  formatRelativeTime,
  isAutoProject,
  normalizeWorkdirPath,
  projectHint,
  projectLabel,
  resolveProjectId,
} from '@/features/chat/lib/project-selection';

const project = (id: string, name: string, mode = 'managed'): ProjectItem => ({
  id,
  name,
  workdirPath: `/w/${id}`,
  directoryMode: mode,
});

const projects = [project('a', 'Alpha'), project('b', 'beta'), project('c', 'Gamma')];

describe('filterProjects', () => {
  it('按名称过滤，大小写不敏感', () => {
    expect(filterProjects(projects, 'alp').map((item) => item.id)).toEqual(['a']);
    expect(filterProjects(projects, 'BET').map((item) => item.id)).toEqual(['b']);
  });

  it('空白查询返回原列表', () => {
    expect(filterProjects(projects, '   ')).toBe(projects);
    expect(filterProjects(projects, '')).toBe(projects);
    expect(filterProjects(projects, null)).toBe(projects);
  });

  it('非 ASCII 名称也按大小写不敏感匹配', () => {
    const named = [project('d', 'Ärger')];

    expect(filterProjects(named, 'ärger').map((item) => item.id)).toEqual(['d']);
    expect(filterProjects(named, 'ÄRGER').map((item) => item.id)).toEqual(['d']);
  });

  it('没有命中时返回空数组', () => {
    expect(filterProjects(projects, 'zzz')).toEqual([]);
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-10-12T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  it('按参照的六档取文案', () => {
    expect(formatRelativeTime(ago(30 * 1000), now)).toBe('刚刚');
    expect(formatRelativeTime(ago(5 * minute), now)).toBe('5分钟前');
    expect(formatRelativeTime(ago(3 * hour), now)).toBe('3小时前');
    expect(formatRelativeTime(ago(4 * day), now)).toBe('4天前');
    expect(formatRelativeTime(ago(60 * day), now)).toBe('2个月前');
    expect(formatRelativeTime(ago(400 * day), now)).toBe('1年前');
  });

  it('无法解析时返回空串，未来时间按刚刚处理', () => {
    expect(formatRelativeTime('nope', now)).toBe('');
    expect(formatRelativeTime(null, now)).toBe('');
    expect(formatRelativeTime(new Date(now + 10 * minute).toISOString(), now)).toBe('刚刚');
  });
});

describe('canCreateProject', () => {
  it('名称与目录都要有', () => {
    expect(canCreateProject({ name: '项目', path: '/a/b' })).toBe(true);
    expect(canCreateProject({ name: '项目', path: '  ' })).toBe(false);
    expect(canCreateProject({ name: '', path: '/a/b' })).toBe(false);
    expect(canCreateProject({ name: null, path: null })).toBe(false);
  });
});

describe('isAutoProject / resolveProjectId', () => {
  it('空值与自动值都算「不使用项目」', () => {
    expect(isAutoProject('')).toBe(true);
    expect(isAutoProject(AUTO_PROJECT_ID)).toBe(true);
    expect(isAutoProject('a')).toBe(false);
  });

  it('下发时归一成空串', () => {
    expect(resolveProjectId(AUTO_PROJECT_ID)).toBe('');
    expect(resolveProjectId('')).toBe('');
    expect(resolveProjectId('a')).toBe('a');
  });
});

describe('projectLabel / projectHint', () => {
  it('自动值显示「选择项目」，并说明发送时建独立目录', () => {
    expect(projectLabel(AUTO_PROJECT_ID, projects)).toBe('选择项目');
    expect(projectHint(AUTO_PROJECT_ID, projects)).toBe(
      '不使用项目（发送时创建独立目录）',
    );
  });

  it('选中已知项目时显示它的名字与目录来源', () => {
    expect(projectLabel('a', projects)).toBe('Alpha');
    expect(projectHint('a', projects)).toBe('系统管理目录');
    expect(projectHint('linked', [project('linked', 'L', 'linked')])).toBe(
      '个人空间已有目录',
    );
  });

  it('选中的项目不在列表里时退到「未命名项目」', () => {
    expect(projectLabel('gone', projects)).toBe('未命名项目');
    expect(projectHint('gone', projects)).toBe('系统管理目录');
  });
});

describe('normalizeWorkdirPath', () => {
  it('去掉前导与尾随斜杠再加回一个', () => {
    expect(normalizeWorkdirPath('a/b')).toBe('/a/b');
    expect(normalizeWorkdirPath('/a/b/')).toBe('/a/b');
    expect(normalizeWorkdirPath('//a/b//')).toBe('/a/b');
  });

  it('空值归一成空串，表示没有可用目录', () => {
    expect(normalizeWorkdirPath('')).toBe('');
    expect(normalizeWorkdirPath('/')).toBe('');
    expect(normalizeWorkdirPath(null)).toBe('');
  });
});
