/**
 * 全局调试弹窗。
 *
 * 四个页签：系统日志（级别筛选 / 关键字 / 自动刷新 / 复制 / 下载）、系统配置（表格与 JSON
 * 两种视图、搜索、复制）、用户与会话（当前登录用户 + 切换身份）、本地存储（键值浏览、搜索、
 * 复制、导出 JSON）。
 *
 * 凭据不外泄：本地存储页的凭据值不展示、不复制、不导出，用户信息卡也不显示 Token 行。
 * 入口只对超管可见，授权由后端 `get_admin_user` 兜底。切换身份是危险操作：二次确认写明
 * 「会获得该用户全部权限」，成功后写回凭据并整页重载，失败时不动当前凭据。
 * 配置页只读：写配置要按 `_config_items[key].type` 提交布尔/数组等真实类型，属于后端管理动作。
 */
import * as React from 'react';
import {
  ChevronDown,
  Copy,
  Download,
  FileText,
  HardDrive,
  RefreshCw,
  Search,
  Settings,
  User,
  UserCog,
} from 'lucide-react';
import { Button, Input, Modal, Spin } from 'antd';
import { useNotifications } from '@/shared/ui/notifications';

import { useUser } from '@/entities/session';

import { debugApi } from '../api/debug-api';
import {
  buildConfigItems,
  buildLogFileName,
  buildStorageExport,
  filterConfigItems,
  filterLogLines,
  filterStorageItems,
  formatConfigValue,
  logLevelClass,
  LOG_LEVELS,
  parseLogLine,
  readStorageItems,
  splitLogText,
  totalStorageBytes,
  type StorageItem,
} from '../lib/debug-view';
import {
  useDebugUsers,
  useSystemConfig,
  useSystemLogs,
} from '../model/debug-queries';
import { useConfirm } from '@/shared/ui/confirm-dialog';

type DebugTab = 'logs' | 'config' | 'users' | 'storage';

export type DebugModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const TABS: Array<{ key: DebugTab; label: string; icon: typeof FileText }> = [
  { key: 'logs', label: '系统日志', icon: FileText },
  { key: 'config', label: '系统配置', icon: Settings },
  { key: 'users', label: '用户与会话', icon: User },
  { key: 'storage', label: '本地存储', icon: HardDrive },
];

export const DebugModal = ({ open, onOpenChange }: DebugModalProps) => {
  const { confirm } = useConfirm();
  const { addNotification } = useNotifications();
  const currentUser = useUser();
  const [tab, setTab] = React.useState<DebugTab>('logs');
  const [levels, setLevels] = React.useState<string[]>([...LOG_LEVELS]);
  const [logSearch, setLogSearch] = React.useState('');
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const [followLatest, setFollowLatest] = React.useState(true);
  const [configView, setConfigView] = React.useState<'table' | 'json'>('table');
  const [configSearch, setConfigSearch] = React.useState('');
  const [userSearch, setUserSearch] = React.useState('');
  const [storageSearch, setStorageSearch] = React.useState('');
  const [storageItems, setStorageItems] = React.useState<StorageItem[]>(() =>
    readStorageItems(window.localStorage),
  );
  const [busyUserId, setBusyUserId] = React.useState<number | null>(null);
  const logViewRef = React.useRef<HTMLDivElement>(null);

  const levelParam = levels.join(',');
  const logs = useSystemLogs(levelParam, { enabled: open, autoRefresh });
  const config = useSystemConfig(open);
  const users = useDebugUsers(open);

  const notify = (type: 'success' | 'error', text: string) =>
    addNotification({ type, title: '调试', message: text });

  const copy = async (text: string, success: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify('success', success);
    } catch {
      notify('error', '复制失败，请检查浏览器剪贴板权限。');
    }
  };

  // 至少留一个级别：一个不选时后端不再过滤级别，会白读整份日志，界面却什么都看不到
  const toggleLevel = (level: string) =>
    setLevels((current) => {
      if (!current.includes(level)) return [...current, level];
      if (current.length === 1) return current;
      return current.filter((item) => item !== level);
    });

  const logLines = React.useMemo(
    () => splitLogText(logs.data ?? '').map(parseLogLine),
    [logs.data],
  );
  const visibleLogs = React.useMemo(
    () => filterLogLines(logLines, levels, logSearch),
    [logLines, levels, logSearch],
  );

  React.useEffect(() => {
    if (tab !== 'logs' || !followLatest) return;
    const view = logViewRef.current;
    if (view) view.scrollTop = view.scrollHeight;
  }, [tab, followLatest, visibleLogs]);

  const configItems = React.useMemo(
    () => filterConfigItems(buildConfigItems(config.data), configSearch),
    [config.data, configSearch],
  );
  const configJson = React.useMemo(
    () => JSON.stringify(config.data ?? {}, null, 2),
    [config.data],
  );

  const visibleUsers = React.useMemo(() => {
    const list = users.data ?? [];
    const needle = userSearch.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((user) =>
      [user.username, user.uid, user.role, user.department_name ?? ''].some(
        (field) => field.toLowerCase().includes(needle),
      ),
    );
  }, [users.data, userSearch]);

  const visibleStorage = React.useMemo(
    () => filterStorageItems(storageItems, storageSearch),
    [storageItems, storageSearch],
  );
  const storageBytes = totalStorageBytes(storageItems);

  const startImpersonate = async (user: { id: number; username: string }) => {
    const confirmed = await confirm({
      title: '危险操作确认',
      description: `确定要切换为用户「${user.username}」吗？切换后将获得该用户的全部操作权限，页面会重新加载。`,
      confirmText: '确认切换',
      destructive: true,
    });
    if (!confirmed) return;
    setBusyUserId(user.id);
    try {
      await debugApi.impersonate(user.id);
      window.location.reload();
    } catch (error) {
      notify(
        'error',
        error instanceof Error ? error.message : '切换用户失败。',
      );
    } finally {
      setBusyUserId(null);
    }
  };

  const downloadLogs = () => {
    const text = visibleLogs.map((line) => line.raw).join('\n');
    const url = URL.createObjectURL(
      new Blob([text], { type: 'text/plain;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = buildLogFileName();
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadStorage = () => {
    const url = URL.createObjectURL(
      new Blob([buildStorageExport(storageItems).json], {
        type: 'application/json',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ars-local-storage.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      open={open}
      onCancel={() => onOpenChange(false)}
      footer={null}
      width={1000}
      styles={{
        body: {
          display: 'flex',
          height: '70vh',
          flexDirection: 'column',
          gap: 8,
          overflow: 'hidden',
        },
      }}
      title={
        <div>
          <div>调试面板</div>
          <div className="text-xs font-normal text-color-text-3">
            系统日志、配置、用户与本地存储；只对超级管理员开放。
          </div>
        </div>
      }
    >
      <nav
        aria-label="调试分区"
        className="flex gap-2 border-b border-color-border-1"
      >
        {TABS.map((item) => {
          const Icon = item.icon;
          const badge =
            item.key === 'logs'
              ? visibleLogs.length
              : item.key === 'storage'
                ? storageItems.length
                : 0;
          return (
            <button
              key={item.key}
              type="button"
              aria-current={tab === item.key ? 'page' : undefined}
              className={`flex items-center gap-1 whitespace-nowrap px-2 py-1 text-sm ${
                tab === item.key
                  ? 'border-b-2 border-primary-6 text-primary-6'
                  : 'text-color-text-2'
              }`}
              onClick={() => {
                setTab(item.key);
                // 进「本地存储」页时重读：弹窗关着的时候别的页面也会写 localStorage
                if (item.key === 'storage') {
                  setStorageItems(readStorageItems(window.localStorage));
                }
              }}
            >
              <Icon className="size-3.5" />
              {item.label}
              {badge > 0 ? (
                <span className="rounded bg-color-fill-2 px-1 text-xs text-color-text-3">
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        {tab === 'logs' ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <fieldset className="flex gap-1">
                <legend className="sr-only">日志级别</legend>
                {LOG_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={levels.includes(level)}
                    className={`rounded px-2 py-0.5 text-xs ${
                      levels.includes(level)
                        ? 'bg-primary-6/10 text-primary-6'
                        : 'bg-color-fill-2 text-color-text-3'
                    }`}
                    onClick={() => toggleLevel(level)}
                  >
                    {level === 'WARNING' ? 'WARN' : level}
                  </button>
                ))}
              </fieldset>
              <div className="relative w-56">
                <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-color-text-3" />
                <Input
                  aria-label="过滤日志关键字"
                  className="pl-7"
                  placeholder="过滤日志关键字..."
                  value={logSearch}
                  onChange={(event) => setLogSearch(event.target.value)}
                />
              </div>
              <span className="text-xs text-color-text-3">
                匹配 {visibleLogs.length} / {logLines.length} 行
              </span>
              <div className="ml-auto flex gap-2">
                <Button
                  htmlType="button"
                  variant={autoRefresh ? 'solid' : 'outlined'}
                  color={autoRefresh ? 'primary' : 'default'}
                  size="small"
                  aria-pressed={autoRefresh}
                  onClick={() => setAutoRefresh((current) => !current)}
                >
                  自动刷新 (5s){autoRefresh ? '' : ': 关'}
                </Button>
                <Button
                  htmlType="button"
                  variant={followLatest ? 'solid' : 'outlined'}
                  color={followLatest ? 'primary' : 'default'}
                  size="small"
                  aria-pressed={followLatest}
                  onClick={() => setFollowLatest((current) => !current)}
                >
                  跟随最新
                </Button>
                <Button
                  htmlType="button"
                  variant="solid"
                  color="primary"
                  size="small"
                  disabled={logs.isFetching}
                  onClick={() => void logs.refetch()}
                >
                  <RefreshCw className="size-3.5" />
                  刷新
                </Button>
                <Button
                  htmlType="button"
                  variant="solid"
                  color="primary"
                  size="small"
                  onClick={() =>
                    void copy(
                      visibleLogs.map((line) => line.raw).join('\n'),
                      '已复制过滤后的日志。',
                    )
                  }
                >
                  <Copy className="size-3.5" />
                  复制
                </Button>
                <Button
                  htmlType="button"
                  variant="solid"
                  color="primary"
                  size="small"
                  onClick={downloadLogs}
                >
                  <Download className="size-3.5" />
                  下载
                </Button>
              </div>
            </div>

            {logs.isError ? (
              <p role="alert" className="text-sm text-danger-6">
                获取日志失败：
                {logs.error instanceof Error ? logs.error.message : '未知错误'}
              </p>
            ) : (
              <div
                ref={logViewRef}
                data-testid="debug-log-view"
                className="min-h-0 flex-1 overflow-auto rounded border border-color-border-1 bg-color-fill-1 p-2 font-mono text-xs"
              >
                {logs.isLoading ? (
                  <span className="flex items-center gap-2 text-color-text-3">
                    <Spin /> 加载中…
                  </span>
                ) : visibleLogs.length === 0 ? (
                  <span className="text-color-text-3">没有匹配的日志。</span>
                ) : (
                  visibleLogs.map((line, index) => (
                    // 日志里同一秒可能重复出现完全相同的行，key 里必须带序号
                    <div
                      key={`${index}-${line.raw}`}
                      data-testid="debug-log-row"
                      className="grid grid-cols-[11rem_5rem_minmax(0,14rem)_1fr] gap-2 whitespace-pre-wrap"
                    >
                      <span className="text-color-text-3">
                        {line.timestamp}
                      </span>
                      <span className={logLevelClass(line.level)}>
                        {line.level}
                      </span>
                      <span
                        className="truncate text-color-text-3"
                        title={line.module}
                      >
                        {line.module}
                      </span>
                      <span className="text-color-text-2">{line.message}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        ) : null}

        {tab === 'config' ? (
          <>
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-color-text-3" />
                <Input
                  aria-label="搜索配置项"
                  className="pl-7"
                  placeholder="搜索键、值或说明..."
                  value={configSearch}
                  onChange={(event) => setConfigSearch(event.target.value)}
                />
              </div>
              <span className="text-xs text-color-text-3">
                共 {configItems.length} 项
              </span>
              <div className="ml-auto flex gap-1">
                <Button
                  htmlType="button"
                  size="small"
                  variant={configView === 'table' ? 'solid' : 'outlined'}
                  color={configView === 'table' ? 'primary' : 'default'}
                  aria-pressed={configView === 'table'}
                  onClick={() => setConfigView('table')}
                >
                  表格
                </Button>
                <Button
                  htmlType="button"
                  size="small"
                  variant={configView === 'json' ? 'solid' : 'outlined'}
                  color={configView === 'json' ? 'primary' : 'default'}
                  aria-pressed={configView === 'json'}
                  onClick={() => setConfigView('json')}
                >
                  JSON
                </Button>
                <Button
                  htmlType="button"
                  variant="solid"
                  color="primary"
                  size="small"
                  onClick={() => void copy(configJson, '已复制系统配置 JSON。')}
                >
                  <Copy className="size-3.5" />
                  复制 JSON
                </Button>
              </div>
            </div>

            {config.isError ? (
              <p role="alert" className="text-sm text-danger-6">
                加载配置失败：
                {config.error instanceof Error
                  ? config.error.message
                  : '未知错误'}
              </p>
            ) : configView === 'json' ? (
              <pre
                data-testid="debug-config-json"
                className="min-h-0 flex-1 overflow-auto rounded border border-color-border-1 bg-color-fill-1 p-2 text-xs"
              >
                {configJson}
              </pre>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto rounded border border-color-border-1">
                <table className="w-full text-left text-xs">
                  <thead className="text-color-text-3">
                    <tr className="border-b border-color-border-1">
                      <th className="px-2 py-1">键</th>
                      <th className="px-2 py-1">值</th>
                      <th className="px-2 py-1">类型</th>
                      <th className="px-2 py-1">说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {configItems.map((item) => (
                      <tr
                        key={item.key}
                        className="border-b border-color-border-1 last:border-0"
                      >
                        <td className="px-2 py-1 font-mono text-color-text-1">
                          {item.key}
                        </td>
                        <td
                          className="max-w-[280px] truncate px-2 py-1 text-color-text-2"
                          title={formatConfigValue(item.value)}
                        >
                          {formatConfigValue(item.value)}
                        </td>
                        <td className="px-2 py-1 text-color-text-3">
                          {item.type}
                        </td>
                        <td className="px-2 py-1 text-color-text-3">
                          {item.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}

        {tab === 'users' ? (
          <>
            <section
              data-testid="debug-current-user"
              className="rounded border border-color-border-1 p-2 text-xs"
            >
              <h3 className="mb-1 font-medium text-color-text-1">
                当前登录用户
              </h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-color-text-2">
                <div className="flex gap-1">
                  <dt className="text-color-text-3">用户名</dt>
                  <dd>{currentUser.data?.username ?? '-'}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="text-color-text-3">uid</dt>
                  <dd className="font-mono">{currentUser.data?.uid ?? '-'}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="text-color-text-3">角色</dt>
                  <dd>{currentUser.data?.role ?? '-'}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="text-color-text-3">部门</dt>
                  <dd>{currentUser.data?.department_name ?? '-'}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="text-color-text-3">最近登录</dt>
                  <dd>{currentUser.data?.last_login ?? '-'}</dd>
                </div>
              </dl>
            </section>

            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-color-text-3" />
                <Input
                  aria-label="搜索用户"
                  className="pl-7"
                  placeholder="搜索用户名、角色或部门..."
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                />
              </div>
              <span className="text-xs text-color-text-3">
                {visibleUsers.length} 个用户
              </span>
              <Button
                htmlType="button"
                variant="solid"
                color="primary"
                size="small"
                className="ml-auto"
                disabled={users.isFetching}
                onClick={() => void users.refetch()}
              >
                <RefreshCw className="size-3.5" />
                刷新列表
              </Button>
            </div>

            {users.isError ? (
              <p role="alert" className="text-sm text-danger-6">
                加载用户失败：
                {users.error instanceof Error
                  ? users.error.message
                  : '未知错误'}
              </p>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto rounded border border-color-border-1">
                <table className="w-full text-left text-xs">
                  <thead className="text-color-text-3">
                    <tr className="border-b border-color-border-1">
                      <th className="px-2 py-1">用户名</th>
                      <th className="px-2 py-1">uid</th>
                      <th className="px-2 py-1">角色</th>
                      <th className="px-2 py-1">部门</th>
                      <th className="px-2 py-1">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleUsers.map((user) => {
                      const isSelf = user.id === currentUser.data?.id;
                      // 后端禁止模拟超管（`不能模拟超级管理员账户`），只对普通账号给入口
                      const canImpersonate =
                        !isSelf && user.role !== 'superadmin';
                      return (
                        <tr
                          key={user.id}
                          className="border-b border-color-border-1 last:border-0"
                        >
                          <td className="px-2 py-1 text-color-text-1">
                            {user.username}
                          </td>
                          <td className="px-2 py-1 font-mono text-color-text-2">
                            {user.uid}
                          </td>
                          <td className="px-2 py-1 text-color-text-2">
                            {user.role}
                          </td>
                          <td className="px-2 py-1 text-color-text-3">
                            {user.department_name ?? '-'}
                          </td>
                          <td className="px-2 py-1">
                            {!canImpersonate ? (
                              <span className="text-color-text-3">
                                {isSelf ? '当前' : '超管不可切换'}
                              </span>
                            ) : (
                              <Button
                                htmlType="button"
                                size="small"
                                variant="solid"
                                color="primary"
                                disabled={busyUserId === user.id}
                                onClick={() => void startImpersonate(user)}
                              >
                                {busyUserId === user.id ? (
                                  <Spin className="size-3" />
                                ) : (
                                  <UserCog className="size-3" />
                                )}
                                切换身份
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {visibleUsers.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-2 py-4 text-center text-color-text-3"
                        >
                          {users.isLoading
                            ? '正在加载用户列表…'
                            : '没有匹配的用户。'}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}

        {tab === 'storage' ? (
          <>
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-color-text-3" />
                <Input
                  aria-label="搜索本地存储"
                  className="pl-7"
                  placeholder="搜索键或值..."
                  value={storageSearch}
                  onChange={(event) => setStorageSearch(event.target.value)}
                />
              </div>
              <span className="text-xs text-color-text-3">
                {visibleStorage.length} 项 · 共{' '}
                {storageBytes / 1024 < 1024
                  ? `${(storageBytes / 1024).toFixed(1)} KB`
                  : `${(storageBytes / 1024 / 1024).toFixed(2)} MB`}
              </span>
              <div className="ml-auto flex gap-2">
                <Button
                  htmlType="button"
                  variant="solid"
                  color="primary"
                  size="small"
                  onClick={() =>
                    setStorageItems(readStorageItems(window.localStorage))
                  }
                >
                  <RefreshCw className="size-3.5" />
                  刷新
                </Button>
                <Button
                  htmlType="button"
                  variant="solid"
                  color="primary"
                  size="small"
                  onClick={() =>
                    void copy(
                      buildStorageExport(storageItems).json,
                      '已复制本地存储 JSON。',
                    )
                  }
                >
                  <Copy className="size-3.5" />
                  复制 JSON
                </Button>
                <Button
                  htmlType="button"
                  variant="solid"
                  color="primary"
                  size="small"
                  onClick={downloadStorage}
                >
                  <Download className="size-3.5" />
                  导出
                </Button>
              </div>
            </div>

            <ul className="min-h-0 flex-1 overflow-auto rounded border border-color-border-1">
              {visibleStorage.map((item) => (
                <li
                  key={item.key}
                  className="flex items-center gap-2 border-b border-color-border-1 px-2 py-1 text-xs last:border-0"
                >
                  <span className="font-mono text-color-text-1">
                    {item.key}
                  </span>
                  {item.isSystem ? (
                    <span className="rounded bg-primary-6/10 px-1 text-primary-6">
                      系统
                    </span>
                  ) : null}
                  <span
                    className="min-w-0 flex-1 truncate text-color-text-3"
                    title={item.masked ? undefined : item.value}
                  >
                    {item.preview}
                  </span>
                  <span className="text-color-text-3">{item.sizeText}</span>
                  {item.masked ? null : (
                    <Button
                      htmlType="button"
                      variant="text"
                      size="middle"
                      className="size-6"
                      aria-label={`复制 ${item.key}`}
                      onClick={() => void copy(item.value, '已复制该键的值。')}
                    >
                      <Copy className="size-3" />
                    </Button>
                  )}
                </li>
              ))}
              {visibleStorage.length === 0 ? (
                <li className="px-2 py-4 text-center text-xs text-color-text-3">
                  没有匹配的条目。
                </li>
              ) : null}
            </ul>
          </>
        ) : null}
      </div>

      <footer className="flex items-center justify-between text-xs text-color-text-3">
        <span className="flex items-center gap-1">
          <ChevronDown className="size-3" />
          调试数据只读展示；切换身份会影响真实环境。
        </span>
        <Button
          htmlType="button"
          variant="solid"
          color="primary"
          size="small"
          onClick={() => onOpenChange(false)}
        >
          关闭
        </Button>
      </footer>
    </Modal>
  );
};
