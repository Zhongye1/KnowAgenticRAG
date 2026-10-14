/**
 * 技能详情视图（`/extensions/skill/:slug`）。
 *
 * 没有单条 GET，从 `GET /api/system/skills` 里按 slug 找（`isInstalledSkill = !!dir_path`；
 * 个人技能不在这个列表里，详情页只服务共享与内置）。三个分区：代码管理（文件树 + 读 /
 * 新建 / 保存 / 删除 + Markdown 预览）、生效范围、依赖；顶部动作是导出 zip 与删除
 * （内置技能不给）。
 */
import * as React from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowLeft,
  Download,
  FilePlus,
  FolderPlus,
  RotateCw,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { Button, Input, Modal, Spin } from 'antd';
import { Empty as SharedEmpty } from '@/shared/ui/empty';

import type { SkillFileNode } from '../api/skill-api';
import { skillApi } from '../api/skill-api';
import {
  ancestorPaths,
  findNode,
  isMarkdownPath,
  SKILL_MD,
  treePaths,
} from '../lib/skill-files';
import {
  canDeleteManagedSkill,
  canEditSkillFiles,
  canExportSkill,
  isBuiltinInstalledSkill,
  isInstalledSkill,
  isReadOnlySkill,
  skillStatusLabel,
  type DetailTab,
} from '../lib/skill-detail';
import {
  useInvalidateSkills,
  useSkillBySlug,
  useSkillFile,
  useSkillTree,
} from '../model/skill-queries';
import { paths } from '@/shared/config';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { MDPreview } from '@/shared/ui/md-preview';
import { useNotifications } from '@/shared/ui/notifications';

import { SkillDependenciesTab } from './skill-dependencies-tab';
import { SkillFileTree } from './skill-file-tree';
import { SkillShareTab } from './skill-share-tab';

const TABS: Array<{ key: DetailTab; label: string }> = [
  { key: 'editor', label: '代码管理' },
  { key: 'settings', label: '生效范围' },
  { key: 'dependencies', label: '依赖管理' },
];

/** 触发浏览器下载；技能导出固定是 zip（后端 `download_name` = `{slug}.zip`）。 */
const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const SkillDetailView = ({ slug }: { slug: string }) => {
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const invalidate = useInvalidateSkills();
  const { skill, allowedAccessLevels, query } = useSkillBySlug(slug);

  const [activeTab, setActiveTab] = React.useState<DetailTab>('editor');
  const [expanded, setExpanded] = React.useState<string[]>([]);
  const [selectedPath, setSelectedPath] = React.useState('');
  const [selectedIsDir, setSelectedIsDir] = React.useState(false);
  const [previewMode, setPreviewMode] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createForm, setCreateForm] = React.useState({
    path: '',
    isDir: false,
    content: '',
  });
  const [creating, setCreating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  const installed = isInstalledSkill(skill);
  const editable = canEditSkillFiles(skill);
  const tree = useSkillTree(slug, installed);
  const file = useSkillFile(
    slug,
    selectedPath,
    !!selectedPath && !selectedIsDir,
  );

  // 打开时默认落在根目录 SKILL.md；它不在根目录时不猜路径。
  // 树数据是查询结果，用渲染期调整而不是 effect：effect + setState 会多提交一帧空选中
  if (tree.data && !selectedPath && findNode(tree.data, SKILL_MD)) {
    setSelectedPath(SKILL_MD);
    setSelectedIsDir(false);
  }

  // 树刷新后丢弃已经消失的展开项，避免残留状态被当成「还开着」
  const validPaths = React.useMemo(
    () => treePaths(tree.data ?? []),
    [tree.data],
  );
  const effectiveExpanded = React.useMemo(
    () => expanded.filter((path) => validPaths.includes(path)),
    [expanded, validPaths],
  );

  const loadedContent = file.data?.content ?? '';
  // 文本草稿与「正在看的文件内容」同步：路径或服务端内容变了就重置，用户编辑不重置
  const draftKey = `${selectedPath}\u0000${loadedContent}`;
  const [draftState, setDraftState] = React.useState({
    key: draftKey,
    value: loadedContent,
  });
  if (draftState.key !== draftKey) {
    setDraftState({ key: draftKey, value: loadedContent });
  }
  const draft = draftState.value;
  const dirty = draft !== loadedContent;

  const notify = (type: 'success' | 'error', message: string) =>
    notifications.addNotification({ type, title: '技能', message });

  const selectNode = (node: SkillFileNode) => {
    setPreviewMode(false);
    setSelectedPath(node.path);
    setSelectedIsDir(node.is_dir);
    // 选中深层文件时把祖先目录展开，否则它在折叠的目录里看不见
    setExpanded((current) => [
      ...new Set([...current, ...ancestorPaths(node.path)]),
    ]);
  };

  const reloadTree = () => {
    setExpanded([]);
    void tree.refetch();
  };

  const saveFile = async () => {
    if (!skill || !selectedPath || selectedIsDir || !editable) return;
    setSaving(true);
    try {
      await skillApi.updateFile(skill.slug, {
        path: selectedPath,
        content: draft,
      });
      invalidate();
      notify('success', '已保存');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const deleteFile = async () => {
    // 后端 `delete_skill_node` 明确拒绝删除根目录 SKILL.md（400），这里不提供该动作
    if (!skill || !selectedPath || !editable || selectedPath === 'SKILL.md')
      return;
    const confirmed = await confirm({
      title: `删除 ${selectedPath}？`,
      description: '该文件会从技能目录里删除，操作不可恢复。',
      confirmText: '删除',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await skillApi.deleteNode(skill.slug, selectedPath);
      setSelectedPath('');
      setSelectedIsDir(false);
      invalidate();
      notify('success', '已删除');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '删除失败');
    }
  };

  const createNode = async () => {
    if (!skill || !createForm.path.trim() || !editable) return;
    setCreating(true);
    try {
      await skillApi.createNode(skill.slug, {
        path: createForm.path.trim(),
        is_dir: createForm.isDir,
        content: createForm.content,
      });
      setCreateOpen(false);
      invalidate();
      notify('success', '创建成功');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const exportZip = async () => {
    if (!skill || !canExportSkill(skill)) return;
    setExporting(true);
    try {
      const blob = await skillApi.exportZip(skill.slug);
      downloadBlob(blob, `${skill.slug}.zip`);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '导出失败');
    } finally {
      setExporting(false);
    }
  };

  const removeSkill = async () => {
    if (!skill || !canDeleteManagedSkill(skill)) return;
    const confirmed = await confirm({
      title: `确认删除技能「${skill.slug}」？`,
      description: '删除后无法恢复，所有文件和配置将永久消失。',
      confirmText: '确认删除',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await skillApi.deleteSkill(skill.slug);
      notify('success', '已删除');
      invalidate();
      navigate(paths.app.extensions.getHref('skills'));
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '删除失败');
    }
  };

  if (query.isPending) {
    return (
      <p className="flex items-center gap-2 p-6 text-sm text-color-text-3">
        <Spin aria-hidden className="size-4" />
        正在加载技能…
      </p>
    );
  }

  if (query.isError) {
    return (
      <p role="alert" className="p-6 text-sm text-danger-6">
        {query.error instanceof Error ? query.error.message : '加载技能失败。'}
      </p>
    );
  }

  if (!skill) {
    return (
      <SharedEmpty
        icon={WandSparkles}
        description="未找到 Skill。它可能已被删除，或你没有管理权限。"
        action={
          <Link to={paths.app.extensions.getHref('skills')}>
            <Button htmlType="button" variant="outlined">
              返回技能列表
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="skill-detail">
      <div className="flex flex-wrap items-start justify-between gap-2 rounded-large border border-color-border-1 bg-color-bg-1 p-4">
        <div className="flex min-w-0 items-start gap-2">
          <Link
            to={paths.app.extensions.getHref('skills')}
            aria-label="返回技能列表"
          >
            <Button htmlType="button" type="text" size="small">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-medium bg-color-fill-2 text-color-text-2">
            <WandSparkles className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-medium text-color-text-1">
              {skill.name || skill.slug}
            </h2>
            <p className="text-xs text-color-text-3">
              {skillStatusLabel(skill)}
              {skill.version ? ` · ${skill.version}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canExportSkill(skill) ? (
            <Button
              htmlType="button"
              variant="outlined"
              disabled={exporting}
              onClick={() => void exportZip()}
            >
              <Download className="size-3.5" aria-hidden />
              {exporting ? '导出中…' : '导出'}
            </Button>
          ) : null}
          {canDeleteManagedSkill(skill) ? (
            <Button
              htmlType="button"
              color="danger"
              variant="solid"
              onClick={() => void removeSkill()}
            >
              <Trash2 className="size-3.5" aria-hidden />
              删除
            </Button>
          ) : null}
        </div>
      </div>

      {isReadOnlySkill(skill) ? (
        <p className="rounded-medium border border-color-border-1 bg-color-bg-2 px-3 py-2 text-xs text-color-text-3">
          你可以查看并使用此 Skill，但没有管理权限。
        </p>
      ) : null}

      {!skill.description ? null : (
        <p className="text-xs text-color-text-3">{skill.description}</p>
      )}

      {installed ? (
        <nav
          className="flex flex-wrap gap-1 border-b border-color-border-1"
          aria-label="技能分区切换"
        >
          {TABS.map((tab) => (
            <Button
              key={tab.key}
              htmlType="button"
              variant="text"
              className="rounded-b-none"
              aria-current={tab.key === activeTab ? 'page' : undefined}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
        </nav>
      ) : null}

      {installed && activeTab === 'editor' ? (
        <div className="flex min-h-96 flex-col gap-2 lg:flex-row">
          <div className="flex min-w-0 flex-1 flex-col rounded-medium border border-color-border-1 bg-color-bg-1">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-color-border-1 px-3 py-2">
              <span className="min-w-0 truncate font-mono text-xs text-color-text-2">
                {selectedPath || '未选择文件'}
              </span>
              <div className="flex items-center gap-2">
                {selectedPath &&
                !selectedIsDir &&
                isMarkdownPath(selectedPath) ? (
                  <Button
                    htmlType="button"
                    variant="outlined"
                    size="small"
                    aria-pressed={previewMode}
                    onClick={() => setPreviewMode((current) => !current)}
                  >
                    {previewMode ? '编辑' : '预览'}
                  </Button>
                ) : null}
                {editable && selectedPath && !selectedIsDir ? (
                  <>
                    <Button
                      htmlType="button"
                      size="small"
                      disabled={saving || !dirty}
                      onClick={() => void saveFile()}
                    >
                      {saving ? '保存中…' : '保存'}
                    </Button>
                    <Button
                      htmlType="button"
                      color="danger"
                      variant="solid"
                      size="small"
                      disabled={selectedPath === 'SKILL.md'}
                      title={
                        selectedPath === 'SKILL.md'
                          ? '根目录 SKILL.md 不允许删除'
                          : undefined
                      }
                      onClick={() => void deleteFile()}
                    >
                      删除文件
                    </Button>
                  </>
                ) : null}
              </div>
            </header>

            <div className="min-h-80 flex-1 p-3">
              {!selectedPath || selectedIsDir ? (
                <SharedEmpty description="选择文件以开始编辑。" />
              ) : file.isPending ? (
                <p className="flex items-center gap-2 text-sm text-color-text-3">
                  <Spin aria-hidden className="size-4" />
                  正在读取文件…
                </p>
              ) : file.isError ? (
                <p role="alert" className="text-sm text-danger-6">
                  {file.error instanceof Error
                    ? file.error.message
                    : '文件读取失败。'}
                </p>
              ) : previewMode ? (
                <MDPreview value={draft} />
              ) : (
                <Input.TextArea
                  className="min-h-80 font-mono text-xs"
                  value={draft}
                  aria-label={selectedPath}
                  readOnly={!editable}
                  spellCheck={false}
                  onChange={(event) =>
                    setDraftState({ key: draftKey, value: event.target.value })
                  }
                />
              )}
            </div>
          </div>

          <aside className="flex w-full flex-col rounded-medium border border-color-border-1 bg-color-bg-1 lg:w-60 lg:shrink-0">
            <header className="flex items-center justify-between gap-1 border-b border-color-border-1 px-3 py-2">
              <span className="text-xs text-color-text-3">项目结构</span>
              <div className="flex items-center gap-1">
                {editable ? (
                  <>
                    <Button
                      htmlType="button"
                      variant="text"
                      size="small"
                      className="size-6 [&_svg]:size-3"
                      aria-label="新建文件"
                      onClick={() => {
                        setCreateForm({ path: '', isDir: false, content: '' });
                        setCreateOpen(true);
                      }}
                    >
                      <FilePlus className="size-3.5" aria-hidden />
                    </Button>
                    <Button
                      htmlType="button"
                      variant="text"
                      size="small"
                      className="size-6 [&_svg]:size-3"
                      aria-label="新建目录"
                      onClick={() => {
                        setCreateForm({ path: '', isDir: true, content: '' });
                        setCreateOpen(true);
                      }}
                    >
                      <FolderPlus className="size-3.5" aria-hidden />
                    </Button>
                  </>
                ) : null}
                <Button
                  htmlType="button"
                  variant="text"
                  size="small"
                  className="size-6 [&_svg]:size-3"
                  aria-label="刷新目录树"
                  onClick={reloadTree}
                >
                  <RotateCw className="size-3.5" aria-hidden />
                </Button>
              </div>
            </header>
            <div className="max-h-96 min-h-32 overflow-y-auto p-2">
              {tree.isPending ? (
                <p className="flex items-center gap-2 p-2 text-xs text-color-text-3">
                  <Spin aria-hidden className="size-3.5" />
                  正在加载目录…
                </p>
              ) : tree.isError ? (
                <p role="alert" className="p-2 text-xs text-danger-6">
                  {tree.error instanceof Error
                    ? tree.error.message
                    : '加载目录树失败'}
                </p>
              ) : (tree.data ?? []).length === 0 ? (
                <p className="p-2 text-xs text-color-text-3">目录为空。</p>
              ) : (
                <SkillFileTree
                  nodes={tree.data ?? []}
                  selectedPath={selectedPath}
                  expanded={effectiveExpanded}
                  onSelect={selectNode}
                  onToggleExpand={(path) =>
                    setExpanded((current) =>
                      current.includes(path)
                        ? current.filter((item) => item !== path)
                        : [...current, path],
                    )
                  }
                />
              )}
            </div>
          </aside>
        </div>
      ) : null}

      {installed && activeTab === 'settings' ? (
        <div className="rounded-medium border border-color-border-1 bg-color-bg-1">
          <SkillShareTab skill={skill} allowedLevels={allowedAccessLevels} />
        </div>
      ) : null}

      {installed && activeTab === 'dependencies' ? (
        <div className="rounded-medium border border-color-border-1 bg-color-bg-1">
          <SkillDependenciesTab skill={skill} editable={editable} />
        </div>
      ) : null}

      {!installed ? (
        <p className="rounded-medium border border-color-border-1 bg-color-bg-2 px-3 py-2 text-xs text-color-text-3">
          这条技能记录没有落盘的技能目录，暂无可管理的内容。
        </p>
      ) : null}

      {createOpen ? (
        <Modal
          open
          width={448}
          data-testid="skill-create-node"
          title={createForm.isDir ? '新建目录' : '新建文件'}
          onCancel={() => setCreateOpen(false)}
          footer={
            <>
              <Button
                htmlType="button"
                variant="outlined"
                onClick={() => setCreateOpen(false)}
              >
                取消
              </Button>
              <Button
                htmlType="button"
                disabled={creating || !createForm.path.trim()}
                onClick={() => void createNode()}
              >
                {creating ? '创建中…' : '创建'}
              </Button>
            </>
          }
        >
          <label
            htmlFor="skill-create-path"
            className="flex flex-col gap-1 text-xs text-color-text-2"
          >
            路径（相对于根目录）
            <Input
              id="skill-create-path"
              value={createForm.path}
              placeholder="src/main.py"
              aria-label="路径（相对于根目录）"
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  path: event.target.value,
                }))
              }
            />
          </label>
          {!createForm.isDir ? (
            <label
              htmlFor="skill-create-content"
              className="flex flex-col gap-1 text-xs text-color-text-2"
            >
              内容
              <Input.TextArea
                id="skill-create-content"
                rows={5}
                value={createForm.content}
                aria-label="内容"
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    content: event.target.value,
                  }))
                }
              />
            </label>
          ) : null}
        </Modal>
      ) : null}

      {isBuiltinInstalledSkill(skill) ? (
        <p className="text-xs text-color-text-3">
          内置 Skill 的文件与依赖由系统维护。
        </p>
      ) : null}
    </div>
  );
};
