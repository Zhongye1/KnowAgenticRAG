/**
 * 项目选择器（空态输入面板 top 区）。
 *
 * 参照 `ProjectSelectionSection.vue`：28px 透明触发钮 + 向上弹出的下拉面板
 * （项目列表 / 历史对话 / 新建表单三视图共用一个面板内嵌视图），不再用 Dialog。
 */
import * as React from 'react';
import { Check, ChevronDown, FolderOpen, History, Plus } from 'lucide-react';

import { Input } from './antd-input';
import { Button } from './antd-button';
import styles from './input-selector.module.css';

import {
  AUTO_PROJECT_ID,
  canCreateProject,
  filterProjects,
  formatRelativeTime,
  normalizeWorkdirPath,
  projectHint,
  projectLabel,
} from '../lib/project-selection';

/**
 * 建项目用的幂等键；与参照同形。
 *
 * 它在进入创建视图时生成一次，失败重试复用同一个：后端按它去重，超时重试不会建出两个项目。
 */
const createRequestId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
import type { HistoryCandidate, ProjectItem } from '../api/projects-api';

type ProjectSelectorProps = {
  projects: ProjectItem[];
  projectsLoading?: boolean;
  projectsError?: string | null;
  selected: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  history: {
    query: string;
    items: HistoryCandidate[];
    loading: boolean;
    error: string | null;
    onQueryChange: (query: string) => void;
  };
  onCreateProject: (input: {
    name: string;
    path: string;
    requestId: string;
  }) => Promise<void>;
};

type PanelView = 'projects' | 'history' | 'create';

export const ProjectSelector = ({
  projects,
  projectsLoading,
  projectsError,
  selected,
  disabled = false,
  onChange,
  history,
  onCreateProject,
}: ProjectSelectorProps) => {
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<PanelView>('projects');
  const [query, setQuery] = React.useState('');
  const [name, setName] = React.useState('');
  const [path, setPath] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [requestId, setRequestId] = React.useState('');

  const close = () => {
    setOpen(false);
    // 关闭即回第一屏：下次打开总是从项目列表开始
    setView('projects');
    setQuery('');
  };

  const select = (projectId: string) => {
    onChange(projectId);
    close();
  };

  const openCreate = (linkedPath: string) => {
    setName('');
    setPath(linkedPath);
    setCreateError(null);
    // 一次创建会话一个键：失败重试复用它，后端据此去重
    setRequestId(createRequestId());
    setView('create');
  };

  const openHistory = () => {
    setCreateError(null);
    setView('history');
    history.onQueryChange('');
  };

  const pickHistory = (candidate: HistoryCandidate) => {
    const workdirPath = normalizeWorkdirPath(candidate.workdirPath);
    if (!workdirPath) {
      setCreateError('该历史对话没有可用目录');
      return;
    }
    openCreate(workdirPath);
  };

  const submitCreate = async () => {
    setSubmitting(true);
    setCreateError(null);
    try {
      await onCreateProject({ name: name.trim(), path: path.trim(), requestId });
      close();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : '项目创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const visibleProjects = filterProjects(projects, query);

  const panel = (
    <div className={styles.projectPanel}>
      {/* 视图标题对辅助技术可见（面板化后没有 DialogTitle） */}
      <h6 className="sr-only">
        {view === 'projects' ? '选择项目' : view === 'history' ? '从历史对话选择目录' : '新建项目'}
      </h6>
      {view === 'projects' ? (
        <div className={styles.projectView}>
          <div className={styles.projectSearch}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索项目"
              aria-label="搜索项目"
            />
          </div>
          {projectsError ? (
            <p className={styles.optionError}>{projectsError}</p>
          ) : null}
          <div className={styles.projectOptionList}>
            <button
              type="button"
              className={styles.projectOption}
              onClick={() => select(AUTO_PROJECT_ID)}
            >
              <span>不使用项目</span>
              <span className={styles.optionMeta}>发送时创建独立目录</span>
            </button>
            {visibleProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={`${styles.projectOption} ${project.id === selected ? styles.projectOptionSelected : ''}`}
                onClick={() => select(project.id)}
              >
                <strong>{project.name}</strong>
                {project.id === selected ? (
                  <Check className={styles.projectOptionCheck} size={13} aria-hidden />
                ) : null}
              </button>
            ))}
            {!projectsLoading && !visibleProjects.length ? (
              <p className={styles.projectEmpty}>还没有项目</p>
            ) : null}
          </div>
          <div className={styles.projectActions}>
            <button type="button" onClick={() => openCreate('')}>
              <Plus size={13} aria-hidden />
              新建项目
            </button>
            <button type="button" onClick={openHistory}>
              <History size={13} aria-hidden />
              从历史对话选择
            </button>
          </div>
        </div>
      ) : null}

      {view === 'history' ? (
        <div className={styles.projectView}>
          <div className={styles.projectSearch}>
            <input
              value={history.query}
              onChange={(event) => history.onQueryChange(event.target.value)}
              placeholder="搜索历史对话"
              aria-label="搜索历史对话"
            />
          </div>
          {history.error ? (
            <p className={styles.optionError}>{history.error}</p>
          ) : null}
          {createError ? (
            <p className={styles.optionError}>{createError}</p>
          ) : null}
          <div className={styles.historyOptionList}>
            {history.items.map((candidate) => (
              <button
                key={candidate.threadId}
                type="button"
                className={styles.historyOption}
                onClick={() => pickHistory(candidate)}
              >
                <span>{candidate.title || candidate.threadId}</span>
                <time>{formatRelativeTime(candidate.updatedAt)}</time>
              </button>
            ))}
            {!history.loading && !history.items.length ? (
              <p className={styles.projectEmpty}>没有可用的历史对话</p>
            ) : null}
          </div>
          <div className={styles.projectActions}>
            <button type="button" onClick={() => setView('projects')}>
              返回项目列表
            </button>
          </div>
        </div>
      ) : null}

      {view === 'create' ? (
        <div className={styles.projectForm}>
          <label className={styles.projectFormField}>
            项目名称
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="项目名称"
              aria-label="项目名称"
            />
          </label>
          <label className={styles.projectFormField}>
            目录路径
            <Input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="目录路径"
              aria-label="目录路径"
            />
          </label>
          {createError ? <p className={styles.optionError}>{createError}</p> : null}
          <div className={styles.projectActions}>
            <button type="button" onClick={() => setView('projects')}>
              返回
            </button>
            <button
              type="button"
              disabled={!canCreateProject({ name, path }) || submitting}
              onClick={() => void submitCreate()}
            >
              <Plus size={13} aria-hidden />
              创建
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className={styles.projectSelection}>
      <button
        type="button"
        className={styles.projectTrigger}
        disabled={disabled || projectsLoading}
        title={projectHint(selected, projects)}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((current) => !current)}
      >
        <FolderOpen className={styles.projectTriggerIcon} size={15} aria-hidden />
        <span className={styles.projectTriggerLabel}>
          {projectLabel(selected, projects)}
        </span>
        <ChevronDown className={styles.projectTriggerIcon} size={15} aria-hidden />
      </button>
      {open ? (
        <>
          {/* 点击面板外关闭；面板本体阻止冒泡 */}
          <div className={styles.projectOverlay} onClick={close} aria-hidden />
          <div className={styles.projectPanelFloating}>{panel}</div>
        </>
      ) : null}
    </div>
  );
};
