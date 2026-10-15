/**
 * 技能面板（`/extensions?tab=skills`）。
 *
 * 搜索 + 一次全量的技能卡片（个人 / 内置 / 共享三组，空组隐藏）+ 批量删除 +
 * SKILL.md 预览弹窗 + 上传与远程安装两个入口；写操作成功后失效查询重取列表。
 */
import * as React from 'react';
import { useNavigate } from 'react-router';
import { Upload, WandSparkles } from 'lucide-react';
import { Button, Spin } from 'antd';
import { Empty as SharedEmpty } from '@/shared/ui/empty';
import {
  ListPrimaryButton,
  ListRefreshButton,
  ListToolbar,
} from '@/shared/ui/list-toolbar';

import type { SkillCard as SkillCardModel } from '../api/skill-api';
import { skillApi } from '../api/skill-api';
import {
  deletableSkills,
  groupSkills,
  invertSelection,
  matchesSkillSearch,
  MAX_BATCH_DELETE,
  selectedDeletableSlugs,
  visibleSkillGroups,
} from '../lib/skill-view';
import { useInvalidateSkills, useSkillCards } from '../model/skill-queries';
import { paths } from '@/shared/config';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { useNotifications } from '@/shared/ui/notifications';

import type { InstallFlowRequest } from './skill-install-flow-dialog';
import { SkillCard } from './skill-card';
import { SkillInstallFlowDialog } from './skill-install-flow-dialog';
import { SkillPreviewDialog } from './skill-preview-dialog';

/** 上传入口接受的文件（后端 `prepare_skill_upload` 只认这两种）。 */
const ACCEPTED_UPLOAD = '.zip,.md';

const isAcceptedUpload = (filename: string): boolean => {
  const lower = filename.toLowerCase();
  return lower.endsWith('.zip') || lower === 'skill.md';
};

export const SkillCardList = () => {
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const cards = useSkillCards();
  const invalidate = useInvalidateSkills();

  const [keyword, setKeyword] = React.useState('');
  const [batchMode, setBatchMode] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [toggling, setToggling] = React.useState<string[]>([]);
  const [preview, setPreview] = React.useState<SkillCardModel | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [flow, setFlow] = React.useState<InstallFlowRequest | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const skills = React.useMemo(() => cards.data?.skills ?? [], [cards.data]);
  const matched = React.useMemo(
    () => skills.filter((skill) => matchesSkillSearch(skill, keyword)),
    [skills, keyword],
  );
  const groups = React.useMemo(
    () => visibleSkillGroups(groupSkills(skills, keyword)),
    [skills, keyword],
  );
  const candidates = React.useMemo(() => deletableSkills(matched), [matched]);

  const notify = (type: 'success' | 'warning' | 'error', message: string) =>
    notifications.addNotification({ type, title: '技能', message });

  const exitBatchMode = () => {
    setBatchMode(false);
    setSelected([]);
  };

  const toggleEnabled = async (skill: SkillCardModel) => {
    if (toggling.includes(skill.slug)) return;
    const enabled = skill.enabled === false;
    setToggling((current) => [...current, skill.slug]);
    try {
      await skillApi.updateEnabled(skill.slug, enabled);
      invalidate();
      notify('success', `Skill 已${enabled ? '启用' : '禁用'}`);
    } catch (error) {
      notify(
        'error',
        error instanceof Error ? error.message : '更新 Skill 启用状态失败',
      );
    } finally {
      setToggling((current) => current.filter((slug) => slug !== skill.slug));
    }
  };

  const toggleSelect = (skill: SkillCardModel) => {
    setSelected((current) =>
      current.includes(skill.slug)
        ? current.filter((slug) => slug !== skill.slug)
        : [...current, skill.slug],
    );
  };

  const removeSkills = async (skillsToDelete: string[]) => {
    setDeleting(true);
    try {
      const results = await skillApi.deleteBatch(skillsToDelete);
      const failed = results.filter((result) => !result.success).length;
      const succeeded = results.length - failed;
      if (failed === 0) {
        notify('success', `批量删除成功，已删除 ${succeeded} 个技能`);
      } else {
        notify(
          'warning',
          `批量删除完成：成功 ${succeeded} 个，失败 ${failed} 个`,
        );
      }
      exitBatchMode();
      invalidate();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '批量删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const batchDelete = async () => {
    // 搜索词变了以后选择可能指向不在列表里的技能，提交前按当前列表过滤一次
    const slugs = selectedDeletableSlugs(matched, selected);
    if (!slugs.length) return;
    if (slugs.length > MAX_BATCH_DELETE) {
      notify(
        'error',
        `一次最多删除 ${MAX_BATCH_DELETE} 个技能，当前选中 ${slugs.length} 个，请分批操作。`,
      );
      return;
    }
    const confirmed = await confirm({
      title: '确定要批量删除选中的技能吗？',
      description: `您已选中了 ${slugs.length} 个技能。该操作将从数据库和物理磁盘中彻底删除这些技能包，且不可恢复！`,
      confirmText: '确定删除',
      destructive: true,
    });
    if (!confirmed) return;
    await removeSkills(slugs);
  };

  const uninstallFromPreview = async (skill: SkillCardModel) => {
    const personal = skill.source_scope === 'personal';
    const confirmed = await confirm({
      title: `卸载 ${skill.name || skill.slug}`,
      description: personal
        ? '卸载后会删除个人 Skill；如有同名共享版本，Agent 将恢复使用共享版本。'
        : '卸载后会删除该 Skill 的数据库记录和本地文件，操作不可恢复。',
      confirmText: '卸载',
      destructive: true,
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      if (personal) {
        await skillApi.deletePersonalSkill(skill.slug);
      } else {
        await skillApi.deleteSkill(skill.slug);
      }
      notify('success', 'Skill 已卸载');
      setPreview(null);
      invalidate();
    } catch (error) {
      notify(
        'error',
        error instanceof Error ? error.message : '卸载 Skill 失败',
      );
    } finally {
      setDeleting(false);
    }
  };

  const startUpload = async (file: File) => {
    if (!isAcceptedUpload(file.name)) {
      notify('error', '仅支持上传 .zip 文件或 SKILL.md 文件');
      return;
    }
    setImporting(true);
    try {
      const draft = await skillApi.prepareUpload(file);
      setFlow({
        kind: 'draft',
        title: `安装 ${file.name}`,
        description: '检查 Skill 依赖与生效范围，然后完成安装。',
        drafts: [draft],
      });
    } catch (error) {
      notify(
        'error',
        error instanceof Error ? error.message : '解析 Skill 失败',
      );
    } finally {
      setImporting(false);
    }
  };

  const openRemoteInstall = () => {
    setFlow({
      kind: 'remote',
      title: '远程安装 Skill',
      description: '按仓库拉取或全局搜索，选择需要安装的 Skill。',
    });
  };

  const busy = cards.isPending || importing;

  return (
    <div className="flex flex-col gap-4" data-testid="skill-card-list">
      <ListToolbar
        search={{
          value: keyword,
          onChange: setKeyword,
          placeholder: '搜索技能...',
          label: '搜索技能',
        }}
        actions={
          batchMode ? (
            <>
              <Button
                htmlType="button"
                type="link"
                size="small"
                onClick={() =>
                  setSelected(candidates.map((skill) => skill.slug))
                }
              >
                全选
              </Button>
              <Button
                htmlType="button"
                type="link"
                size="small"
                onClick={() =>
                  setSelected(invertSelection(candidates, selected))
                }
              >
                反选
              </Button>
              <Button
                htmlType="button"
                type="link"
                size="small"
                onClick={() => setSelected([])}
              >
                清空
              </Button>
              <Button
                htmlType="button"
                color="danger"
                variant="solid"
                disabled={selected.length === 0 || deleting}
                onClick={() => void batchDelete()}
              >
                批量删除 ({selected.length})
              </Button>
              <Button
                htmlType="button"
                variant="outlined"
                disabled={deleting}
                onClick={exitBatchMode}
              >
                退出管理
              </Button>
            </>
          ) : (
            <>
              <Button
                htmlType="button"
                variant="outlined"
                disabled={busy || candidates.length === 0}
                onClick={() => setBatchMode(true)}
              >
                批量管理
              </Button>
              <Button
                htmlType="button"
                variant="outlined"
                disabled={busy}
                onClick={openRemoteInstall}
              >
                远程安装
              </Button>
              <ListPrimaryButton
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                <Upload className="size-4" aria-hidden />
                {importing ? '解析中…' : '上传 Skill'}
              </ListPrimaryButton>
              <input
                ref={fileInput}
                type="file"
                className="hidden"
                accept={ACCEPTED_UPLOAD}
                aria-label="上传 Skill 文件"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  // 同一个文件连续选两次也要触发：清掉 input 的值
                  event.target.value = '';
                  if (file) void startUpload(file);
                }}
              />
              <ListRefreshButton
                label="刷新 Skills"
                refreshing={cards.isFetching}
                onClick={() => void cards.refetch()}
              />
            </>
          )
        }
      />

      {cards.isPending ? (
        <p className="flex items-center gap-2 py-8 text-sm text-color-text-3">
          <Spin aria-hidden className="size-4" />
          正在加载技能…
        </p>
      ) : cards.isError ? (
        <div className="flex flex-col items-start gap-2 py-8">
          <p role="alert" className="text-sm text-danger-6">
            {cards.error instanceof Error
              ? cards.error.message
              : '加载技能失败。'}
          </p>
          <Button
            htmlType="button"
            variant="outlined"
            onClick={() => void cards.refetch()}
          >
            重试
          </Button>
        </div>
      ) : groups.length === 0 ? (
        <SharedEmpty
          icon={WandSparkles}
          description={
            keyword
              ? '没有匹配的 Skill。换个关键词试试，或清空搜索条件。'
              : '还没有添加 Skill。可以从远程仓库安装，或上传本地 Skill 文件。'
          }
        />
      ) : (
        groups.map((group) => (
          <section
            key={group.key}
            data-group={group.key}
            className="flex flex-col gap-2"
          >
            <h3 className="text-sm text-color-text-2">{group.title}</h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
              {group.skills.map((skill) => (
                <SkillCard
                  key={`${group.key}:${skill.slug || skill.id}`}
                  skill={skill}
                  batchMode={batchMode}
                  selected={selected.includes(skill.slug)}
                  toggling={toggling.includes(skill.slug)}
                  onOpen={setPreview}
                  onToggleEnabled={(item) => void toggleEnabled(item)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {preview ? (
        <SkillPreviewDialog
          skill={preview}
          toggling={toggling.includes(preview.slug)}
          deleting={deleting}
          onOpenChange={(open) => {
            if (!open) setPreview(null);
          }}
          onToggleEnabled={(item) => void toggleEnabled(item)}
          onUninstall={(item) => void uninstallFromPreview(item)}
          onManage={(item) => {
            setPreview(null);
            navigate(paths.app.extensions.skill.getHref(item.slug));
          }}
        />
      ) : null}

      {flow ? (
        <SkillInstallFlowDialog
          flow={flow}
          onClose={() => setFlow(null)}
          onCompleted={({ success, failed }) => {
            if (failed === 0) notify('success', `已添加 ${success} 个 Skill`);
            else
              notify(
                'warning',
                `安装完成：成功 ${success} 个，失败 ${failed} 个`,
              );
            invalidate();
          }}
        />
      ) : null}
    </div>
  );
};
