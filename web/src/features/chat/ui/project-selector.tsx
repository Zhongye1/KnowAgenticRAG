/**
 * 项目选择器（空态输入面板 top 区）。
 *
 * 参照 `ProjectSelectionSection.vue`：28px 透明触发钮 + 向上弹出的下拉面板（项目列表 /
 * 历史对话两个视图），新建项目走 Modal（名称 + 目录选择器）。
 *
 * 数据仍由页面用 react-query 拉好注入（`projects` / `history` / `onCreateProject`），
 * 组件只做交互：参照把加载放在组件里，是因为它没有数据层；本仓有，重复一份只会让缓存失效
 * 变成两处。
 */
import * as React from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  FolderClosed,
  FolderPlus,
  FolderX,
  History,
  MessageSquare,
  Search,
} from 'lucide-react';

import { Dropdown, Input, Modal, Spin } from 'antd';

import { useNotifications } from '@/shared/ui/notifications';

import styles from './input-selector.module.css';
import { WorkspacePathPicker } from './workspace-path-picker';

import {
  AUTO_PROJECT_ID,
  canCreateProject,
  filterProjects,
  formatRelativeTime,
  isAutoProject,
  normalizeWorkdirPath,
  projectHint,
  projectLabel,
} from '../lib/project-selection';

/**
 * 建项目用的幂等键；与参照同形。
 *
 * 它在进入创建弹窗时生成一次，失败重试复用同一个：后端按它去重，超时重试不会建出两个项目。
 */
const createRequestId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
import type { HistoryCandidate, ProjectItem } from '../api/projects-api';

/** 打开面板后把焦点放进搜索框的延时；参照同值，等弹层挂载。 */
const SEARCH_FOCUS_DELAY_MS = 120;

type PanelView = 'projects' | 'history';

type ProjectSelectorProps = {
  projects: ProjectItem[];
  projectsLoading?: boolean;
  projectsError?: string | null;
  /** 项目列表加载失败时的重试入口；面板里的「重新加载」用它。 */
  onReloadProjects: () => void;
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

export const ProjectSelector = ({
  projects,
  projectsLoading,
  projectsError,
  onReloadProjects,
  selected,
  disabled = false,
  onChange,
  history,
  onCreateProject,
}: ProjectSelectorProps) => {
  const { addNotification } = useNotifications();
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<PanelView>('projects');
  const [query, setQuery] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [path, setPath] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [requestId, setRequestId] = React.useState('');

  const projectSearchRef = React.useRef<HTMLInputElement>(null);
  const historySearchRef = React.useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    // 关闭即回第一屏：下次打开总是从项目列表开始
    setView('projects');
    setQuery('');
  };

  // 打开与切视图都把焦点放进对应的搜索框；弹层挂载晚于状态变化，所以延时一次
  React.useEffect(() => {
    if (!open) return;

    const target = view === 'history' ? historySearchRef : projectSearchRef;
    const timer = window.setTimeout(
      () => target.current?.focus(),
      SEARCH_FOCUS_DELAY_MS,
    );

    return () => window.clearTimeout(timer);
  }, [open, view]);

  const select = (projectId: string) => {
    onChange(projectId);
    close();
  };

  const openCreate = (linkedPath: string) => {
    setOpen(false);
    setView('projects');
    setQuery('');
    setName('');
    setPath(linkedPath);
    // 一次创建会话一个键：失败重试复用它，后端据此去重
    setRequestId(createRequestId());
    setCreateOpen(true);
  };

  const pickHistory = (candidate: HistoryCandidate) => {
    const workdirPath = normalizeWorkdirPath(candidate.workdirPath);
    if (!workdirPath) {
      addNotification({
        type: 'error',
        title: '项目',
        message: '该历史对话没有可用目录',
      });
      return;
    }

    openCreate(workdirPath);
  };

  const canSubmitCreate = canCreateProject({ name, path }) && !submitting;

  const submitCreate = async () => {
    if (!canSubmitCreate) return;

    setSubmitting(true);
    try {
      await onCreateProject({
        name: name.trim(),
        path: path.trim(),
        requestId,
      });
      setCreateOpen(false);
      addNotification({ type: 'success', title: '项目', message: '已创建' });
    } catch (error) {
      // 失败不关弹窗：名称与目录都还在，用户可以改一处再试
      addNotification({
        type: 'error',
        title: '项目',
        message: error instanceof Error ? error.message : '创建失败',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const visibleProjects = filterProjects(projects, query);
  const autoSelected = isAutoProject(selected);

  const panel = (
    <div className={styles.projectPanel}>
      {view === 'projects' ? (
        <>
          <label className={styles.projectSearch}>
            <Search
              className={styles.projectSearchIcon}
              size={14}
              aria-hidden
            />
            <input
              ref={projectSearchRef}
              type="search"
              value={query}
              placeholder="搜索项目"
              aria-label="搜索项目"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className={styles.projectOptionList} aria-label="选择项目">
            {projectsLoading ? (
              <div className={styles.projectLoading}>
                <Spin aria-hidden />
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className={`${styles.projectOption} ${
                    autoSelected ? styles.projectOptionSelected : ''
                  }`}
                  aria-pressed={autoSelected}
                  onClick={() => select(AUTO_PROJECT_ID)}
                >
                  <span className={styles.projectOptionIcon}>
                    <FolderX size={15} aria-hidden />
                  </span>
                  <span className={styles.projectOptionBody}>
                    <strong>不使用项目</strong>
                  </span>
                  {autoSelected ? (
                    <Check
                      className={styles.projectOptionCheck}
                      size={14}
                      aria-hidden
                    />
                  ) : null}
                </button>

                {visibleProjects.map((project) => {
                  const isSelected = selected === project.id;
                  return (
                    <button
                      key={project.id}
                      type="button"
                      className={`${styles.projectOption} ${
                        isSelected ? styles.projectOptionSelected : ''
                      }`}
                      aria-pressed={isSelected}
                      onClick={() => select(project.id)}
                    >
                      <span className={styles.projectOptionIcon}>
                        <FolderClosed size={15} aria-hidden />
                      </span>
                      <span className={styles.projectOptionBody}>
                        <strong title={project.name}>{project.name}</strong>
                      </span>
                      {isSelected ? (
                        <Check
                          className={styles.projectOptionCheck}
                          size={14}
                          aria-hidden
                        />
                      ) : null}
                    </button>
                  );
                })}

                {visibleProjects.length === 0 ? (
                  <div className={styles.projectEmpty}>
                    {query ? '没有匹配的项目' : '暂无已有项目'}
                  </div>
                ) : null}
              </>
            )}
          </div>

          {projectsError ? (
            <div className={styles.projectError} role="alert">
              <span>{projectsError}</span>
              <button type="button" onClick={onReloadProjects}>
                重新加载
              </button>
            </div>
          ) : null}

          <div className={styles.projectActions}>
            <button type="button" onClick={() => openCreate('')}>
              <FolderPlus size={14} aria-hidden />
              <span>新建项目</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setView('history');
                history.onQueryChange('');
              }}
            >
              <History size={14} aria-hidden />
              <span>从历史对话添加</span>
              <ChevronRight
                className={styles.projectActionChevron}
                size={14}
                aria-hidden
              />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className={styles.historySearchRow}>
            <button
              type="button"
              aria-label="返回项目列表"
              onClick={() => {
                setView('projects');
                history.onQueryChange('');
              }}
            >
              <ArrowLeft size={15} aria-hidden />
            </button>
            <label className={styles.projectSearch}>
              <Search
                className={styles.projectSearchIcon}
                size={14}
                aria-hidden
              />
              <input
                ref={historySearchRef}
                type="search"
                value={history.query}
                placeholder="搜索历史对话"
                aria-label="搜索历史对话"
                onChange={(event) => history.onQueryChange(event.target.value)}
              />
            </label>
          </div>

          <div className={styles.historyOptionList} aria-label="选择历史对话">
            {history.loading ? (
              <div className={styles.historyLoading}>
                <Spin aria-hidden />
              </div>
            ) : (
              <>
                {history.items.map((candidate) => {
                  const time = formatRelativeTime(candidate.updatedAt);
                  return (
                    <button
                      key={candidate.threadId}
                      type="button"
                      className={styles.historyOption}
                      onClick={() => pickHistory(candidate)}
                    >
                      <MessageSquare
                        className={styles.historyOptionIcon}
                        size={14}
                        aria-hidden
                      />
                      <span title={candidate.title}>
                        {candidate.title || '未命名对话'}
                      </span>
                      {time ? <time>{time}</time> : null}
                    </button>
                  );
                })}

                {history.items.length === 0 ? (
                  <div className={styles.historyEmpty}>
                    {history.error || '没有可添加的历史对话'}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className={styles.projectSelection}>
      <Dropdown
        open={open}
        onOpenChange={(next) => {
          if (next) setOpen(true);
          else close();
        }}
        trigger={['click']}
        placement="topLeft"
        disabled={disabled}
        popupRender={() => panel}
      >
        <button
          type="button"
          className={`${styles.projectTrigger} ${
            open ? styles.projectTriggerActive : ''
          }`}
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <FolderClosed
            className={styles.projectTriggerIcon}
            size={15}
            aria-hidden
          />
          <span
            className={styles.projectTriggerLabel}
            title={projectHint(selected, projects)}
          >
            {projectLabel(selected, projects)}
          </span>
        </button>
      </Dropdown>

      <Modal
        open={createOpen}
        title="新建项目"
        width={640}
        okText="创建并选择"
        cancelText="取消"
        confirmLoading={submitting}
        okButtonProps={{ disabled: !canCreateProject({ name, path }) }}
        onOk={() => void submitCreate()}
        onCancel={() => setCreateOpen(false)}
      >
        <div className={styles.projectForm}>
          <label className={styles.projectFormField} htmlFor="project-name">
            <span>项目名称</span>
            <Input
              id="project-name"
              value={name}
              maxLength={100}
              autoFocus
              placeholder="例如：产品发布计划"
              aria-label="项目名称"
              onChange={(event) => setName(event.target.value)}
              onPressEnter={() => void submitCreate()}
            />
          </label>

          <div className={styles.projectFormField}>
            <span>项目目录</span>
            {/* 每次创建会话换一个 key：目录选择器的当前目录与新建文件夹行随会话重置 */}
            <WorkspacePathPicker
              key={requestId}
              value={path}
              active={createOpen}
              disabled={submitting}
              includeUnboundProjectDirs
              onChange={setPath}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
