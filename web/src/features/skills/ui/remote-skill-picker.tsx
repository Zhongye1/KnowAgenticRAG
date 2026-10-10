/**
 * 远程安装的选择区。
 *
 * 两个页签（按仓库拉取、全局搜索发现）；选择状态收进 `useRemotePicker`，选择区只渲染，
 * 摘要与「解析并确认」由安装流弹窗的底栏消费。
 */
import * as React from 'react';
import { History, Trash2 } from 'lucide-react';

import type { RemoteSkillHit, RemoteSkillOption } from '../api/skill-api';
import {
  addRepoHistory,
  buildRepoRequests,
  buildSearchRequests,
  filterRepoSkills,
  hitKey,
  invertHitSelection,
  invertRepoSelection,
  readRepoHistory,
  removeRepoHistory,
  remoteSelectionSummary,
  toggleHit,
  writeRepoHistory,
  type RemoteTab,
} from '../lib/remote-skills';
import type { RemoteRequest } from '../lib/install-flow';
import { skillApi } from '../api/skill-api';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';
import { useNotifications } from '@/shared/ui/notifications';

export const useRemotePicker = () => {
  const notifications = useNotifications();
  const [tab, setTab] = React.useState<RemoteTab>('repo');

  const [source, setSource] = React.useState('');
  const [options, setOptions] = React.useState<RemoteSkillOption[]>([]);
  const [selectedNames, setSelectedNames] = React.useState<string[]>([]);
  const [filter, setFilter] = React.useState('');
  const [listing, setListing] = React.useState(false);
  const [history, setHistory] = React.useState<string[]>(() =>
    readRepoHistory(),
  );

  const [query, setQuery] = React.useState('');
  const [hits, setHits] = React.useState<RemoteSkillHit[]>([]);
  const [selectedHits, setSelectedHits] = React.useState<RemoteSkillHit[]>([]);
  const [searching, setSearching] = React.useState(false);

  const visibleOptions = React.useMemo(
    () => filterRepoSkills(options, filter),
    [options, filter],
  );

  const rememberSource = (value: string) => {
    setHistory((current) => {
      const next = addRepoHistory(current, value);
      writeRepoHistory(next);
      return next;
    });
  };

  const listFromRepo = async () => {
    const value = source.trim();
    if (!value) {
      notifications.addNotification({
        type: 'warning',
        title: '远程安装',
        message: '请输入来源仓库。',
      });
      return;
    }
    setListing(true);
    try {
      const found = await skillApi.listRemote(value);
      setOptions(found);
      setSelectedNames(found.length === 1 ? [found[0].name] : []);
      if (!found.length) {
        notifications.addNotification({
          type: 'warning',
          title: '远程安装',
          message: '未发现可安装的 Skills。',
        });
        return;
      }
      notifications.addNotification({
        type: 'success',
        title: '远程安装',
        message:
          found.length === 1
            ? '已发现 1 个 Skill，已自动选中。'
            : `已发现 ${found.length} 个 Skills。`,
      });
      rememberSource(value);
    } catch (error) {
      notifications.addNotification({
        type: 'error',
        title: '远程安装',
        message:
          error instanceof Error ? error.message : '获取远程 Skills 失败。',
      });
    } finally {
      setListing(false);
    }
  };

  const searchGlobally = async () => {
    const value = query.trim();
    if (!value) {
      notifications.addNotification({
        type: 'warning',
        title: '远程安装',
        message: '请输入搜索关键字。',
      });
      return;
    }
    setSearching(true);
    try {
      const found = await skillApi.searchRemote(value);
      setHits(found);
      setSelectedHits(found.length === 1 ? [...found] : []);
      if (!found.length) {
        notifications.addNotification({
          type: 'warning',
          title: '远程安装',
          message: '未搜索到相关的 Skills。',
        });
        return;
      }
      notifications.addNotification({
        type: 'success',
        title: '远程安装',
        message:
          found.length === 1
            ? '搜索到 1 个 Skill，已自动选中。'
            : `搜索到 ${found.length} 个 Skills。`,
      });
    } catch (error) {
      notifications.addNotification({
        type: 'error',
        title: '远程安装',
        message:
          error instanceof Error ? error.message : '搜索远程 Skills 失败。',
      });
    } finally {
      setSearching(false);
    }
  };

  const switchTab = (next: RemoteTab) => {
    setTab(next);
    // 换页签清空选择：两个页签的选择语义不同
    setSelectedNames([]);
    setSelectedHits([]);
  };

  const summary = remoteSelectionSummary(
    tab,
    tab === 'repo' ? options.length : hits.length,
    tab === 'repo' ? selectedNames.length : selectedHits.length,
  );

  const canSubmit =
    tab === 'repo' ? selectedNames.length > 0 : selectedHits.length > 0;

  const buildRequests = (): RemoteRequest[] =>
    tab === 'repo'
      ? buildRepoRequests(source.trim(), selectedNames, options)
      : buildSearchRequests(selectedHits);

  return {
    tab,
    switchTab,
    source,
    setSource,
    options,
    visibleOptions,
    selectedNames,
    setSelectedNames,
    filter,
    setFilter,
    listing,
    listFromRepo,
    history,
    selectHistory: (value: string) => {
      if (value === '__clear__') {
        setHistory([]);
        writeRepoHistory([]);
        notifications.addNotification({
          type: 'success',
          title: '远程安装',
          message: '历史记录已清空。',
        });
        return;
      }
      setSource(value);
    },
    deleteHistory: (value: string) => {
      setHistory((current) => {
        const next = removeRepoHistory(current, value);
        writeRepoHistory(next);
        return next;
      });
    },
    query,
    setQuery,
    hits,
    selectedHits,
    setSelectedHits,
    searching,
    searchGlobally,
    summary,
    canSubmit,
    buildRequests,
  };
};

export type RemotePicker = ReturnType<typeof useRemotePicker>;

const Row = ({
  checked,
  label,
  hint,
  trailing,
  onToggle,
}: {
  checked: boolean;
  label: string;
  hint: string;
  trailing?: string;
  onToggle: (checked: boolean) => void;
}) => (
  <label className="flex cursor-pointer items-start gap-2 rounded-small px-2 py-1.5 hover:bg-color-fill-1">
    <Checkbox
      className="mt-0.5"
      checked={checked}
      aria-label={label}
      onCheckedChange={(value) => onToggle(value === true)}
    />
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-sm text-color-text-1">{label}</span>
      <span className="truncate text-xs text-color-text-3">{hint}</span>
    </span>
    {trailing ? (
      <span className="shrink-0 text-xs text-color-text-3">{trailing}</span>
    ) : null}
  </label>
);

const SelectionActions = ({
  onAll,
  onInvert,
  onNone,
}: {
  onAll: () => void;
  onInvert: () => void;
  onNone: () => void;
}) => (
  <div className="flex items-center gap-1">
    <Button type="button" variant="link" size="sm" onClick={onAll}>
      全选
    </Button>
    <Button type="button" variant="link" size="sm" onClick={onInvert}>
      反选
    </Button>
    <Button type="button" variant="link" size="sm" onClick={onNone}>
      清空
    </Button>
  </div>
);

export const RemoteSkillPicker = ({ picker }: { picker: RemotePicker }) => {
  return (
    <div className="flex min-h-0 flex-col gap-3" data-testid="remote-picker">
      <div
        className="flex gap-1 border-b border-color-border-1"
        role="tablist"
        aria-label="远程安装方式"
      >
        {(
          [
            ['repo', '按仓库拉取'],
            ['search', '全局搜索发现'],
          ] as Array<[RemoteTab, string]>
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            role="tab"
            variant="ghost"
            size="sm"
            className="rounded-b-none"
            aria-selected={picker.tab === key}
            aria-current={picker.tab === key ? 'page' : undefined}
            onClick={() => picker.switchTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {picker.tab === 'repo' ? (
        <>
          <div className="flex items-start gap-2">
            <div className="relative flex-1">
              <Input
                value={picker.source}
                aria-label="来源仓库"
                placeholder="来源仓库或合集地址，如 owner/repo 或 GitHub URL"
                onChange={(event) => picker.setSource(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void picker.listFromRepo();
                }}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute top-0.5 right-0.5"
                    aria-label="历史仓库"
                  >
                    <History className="size-3.5" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-w-80">
                  {picker.history.length === 0 ? (
                    <DropdownMenuItem disabled>暂无使用历史</DropdownMenuItem>
                  ) : (
                    <>
                      {picker.history.map((item) => (
                        <DropdownMenuItem
                          key={item}
                          onSelect={() => picker.selectHistory(item)}
                        >
                          <span
                            className="min-w-0 flex-1 truncate"
                            title={item}
                          >
                            {item}
                          </span>
                          <button
                            type="button"
                            aria-label={`删除历史 ${item}`}
                            className="ml-2 shrink-0 text-color-text-3"
                            onClick={(event) => {
                              event.stopPropagation();
                              picker.deleteHistory(item);
                            }}
                          >
                            <Trash2 className="size-3" aria-hidden />
                          </button>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => picker.selectHistory('__clear__')}
                      >
                        <Trash2 className="size-3" aria-hidden />
                        清空历史记录
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Button
              type="button"
              disabled={picker.listing}
              onClick={() => void picker.listFromRepo()}
            >
              {picker.listing ? (
                <>
                  <Spinner aria-hidden className="size-3.5" />
                  拉取中…
                </>
              ) : (
                '拉取技能'
              )}
            </Button>
          </div>
          <p className="text-xs text-color-text-3">
            支持 `owner/repo` 或 GitHub URL；可前往{' '}
            <a
              className="text-link-6 underline"
              href="https://skills.sh/"
              target="_blank"
              rel="noopener noreferrer"
            >
              skills.sh
            </a>{' '}
            查询开源 skills。每次仅限一个来源，可多选其中的 Skill。
          </p>

          {picker.options.length ? (
            <div className="flex min-h-0 flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <SelectionActions
                  onAll={() =>
                    picker.setSelectedNames(
                      picker.visibleOptions.map((item) => item.name),
                    )
                  }
                  onInvert={() =>
                    picker.setSelectedNames(
                      invertRepoSelection(
                        picker.visibleOptions,
                        picker.selectedNames,
                      ),
                    )
                  }
                  onNone={() => picker.setSelectedNames([])}
                />
                <Input
                  className="w-45"
                  value={picker.filter}
                  aria-label="本地过滤"
                  placeholder="本地过滤检索…"
                  onChange={(event) => picker.setFilter(event.target.value)}
                />
              </div>
              <div className="max-h-64 min-h-0 overflow-y-auto rounded-medium border border-color-border-1">
                {picker.visibleOptions.map((option) => (
                  <Row
                    key={option.name}
                    checked={picker.selectedNames.includes(option.name)}
                    label={option.name}
                    hint={option.description || '暂无描述'}
                    onToggle={(checked) =>
                      picker.setSelectedNames((current) =>
                        checked
                          ? [...new Set([...current, option.name])]
                          : current.filter((name) => name !== option.name),
                      )
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="flex items-start gap-2">
            <Input
              className="flex-1"
              value={picker.query}
              aria-label="搜索关键字"
              placeholder="输入 web、python 等关键字进行全局查找"
              onChange={(event) => picker.setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void picker.searchGlobally();
              }}
            />
            <Button
              type="button"
              disabled={picker.searching}
              onClick={() => void picker.searchGlobally()}
            >
              {picker.searching ? (
                <>
                  <Spinner aria-hidden className="size-3.5" />
                  查找中…
                </>
              ) : (
                '查找技能'
              )}
            </Button>
          </div>
          <p className="text-xs text-color-text-3">
            直接输入关键字检索 skills.sh 上的开源
            Skills，选中的来源会逐个拉取安装。
          </p>

          {picker.hits.length ? (
            <div className="flex min-h-0 flex-col gap-2">
              <SelectionActions
                onAll={() => picker.setSelectedHits([...picker.hits])}
                onInvert={() =>
                  picker.setSelectedHits(
                    invertHitSelection(picker.hits, picker.selectedHits),
                  )
                }
                onNone={() => picker.setSelectedHits([])}
              />
              <div className="max-h-64 min-h-0 overflow-y-auto rounded-medium border border-color-border-1">
                {picker.hits.map((hit) => (
                  <Row
                    key={hitKey(hit)}
                    checked={picker.selectedHits.some(
                      (item) => hitKey(item) === hitKey(hit),
                    )}
                    label={hit.name}
                    hint={hit.source}
                    trailing={hit.installs || undefined}
                    onToggle={() =>
                      picker.setSelectedHits((current) =>
                        toggleHit(current, hit),
                      )
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};
