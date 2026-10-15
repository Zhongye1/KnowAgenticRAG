/** 文件面板的首行：左边主色「上传」下拉（上传文件 / 新建文件夹），右边一排统计按钮。 */
import * as React from 'react';
import {
  Blocks,
  CircleAlert,
  Database as DatabaseIcon,
  FileText,
  FolderPlus,
  Hash,
  LoaderCircle,
  Upload,
} from 'lucide-react';
import { Dropdown } from 'antd';

import { cn } from '@/shared/lib';

/** 统计卡：30px 高、12px 横向内边距、6px 圆角、白底细边框。 */
const statCardClass =
  'inline-flex min-h-[30px] min-w-[87px] items-center justify-center gap-1.5 rounded-[6px] border border-[var(--gray-200)] bg-[var(--gray-0)] px-3 text-xs font-normal text-[var(--gray-700)] transition-colors';

const statWarningClass =
  'cursor-pointer border-[var(--color-warning-100)] bg-[var(--color-warning-50)] text-[var(--color-warning-700)] hover:border-[var(--color-warning-500)]';

const statRepairClass =
  'cursor-pointer hover:border-[var(--main-300)] hover:bg-[var(--main-30)]';

/** 统计内联：图标 16 + 值 13px 深色 + 标签 10px 灰，同一行基线对齐。 */
const StatInline = ({
  icon,
  value,
  label,
  spinning = false,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  spinning?: boolean;
}) => (
  <>
    <span className={cn('shrink-0', spinning && 'animate-spin')} aria-hidden>
      {icon}
    </span>
    <span className="flex items-baseline gap-1">
      <span className="text-[13px] leading-tight text-[var(--gray-900)]">
        {value}
      </span>
      <span className="text-[10px] leading-none text-[var(--gray-500)]">
        {label}
      </span>
    </span>
  </>
);

export type FilePanelStats = {
  pendingParseCount: number;
  pendingIndexCount: number;
  fileCount: number;
  sizeText: string;
  chunkText: string;
  tokenText: string;
  hasVirtualFolders: boolean;
};

export type FilePanelActions = {
  onBatchParse: () => void;
  onBatchIndex: () => void;
  onConvertVirtualFolders: () => void;
  onRepairStats: () => void;
  onUploadFiles: () => void;
  onCreateFolder: () => void;
};

export const FilePanelHeader = ({
  stats,
  actions,
  busy = false,
  repairing = false,
  canManage = true,
  testId = 'file-panel-header',
}: {
  stats: FilePanelStats;
  actions: FilePanelActions;
  /** 任一批量入口在飞行中：解析/入库按钮禁用。 */
  busy?: boolean;
  /** 统计修复在飞行中：修复按钮转圈。 */
  repairing?: boolean;
  canManage?: boolean;
  testId?: string;
}) => (
  <div
    data-testid={testId}
    className="flex flex-wrap items-center justify-between gap-5"
  >
    {canManage ? (
      <Dropdown
        trigger={['click']}
        menu={{
          items: [
            { key: 'upload', icon: <Upload size={14} />, label: '上传文件' },
            {
              key: 'folder',
              icon: <FolderPlus size={14} />,
              label: '新建文件夹',
            },
          ],
          onClick: ({ key }) => {
            if (key === 'upload') actions.onUploadFiles();
            if (key === 'folder') actions.onCreateFolder();
          },
        }}
      >
        <button
          type="button"
          className="inline-flex min-h-[30px] items-center gap-1.5 rounded-[6px] bg-[var(--main-600)] px-3 text-xs font-medium text-[var(--main-0)] transition-colors hover:bg-[var(--main-700)]"
        >
          <Upload size={14} aria-hidden />
          上传
        </button>
      </Dropdown>
    ) : (
      <span />
    )}

    <div className="flex flex-wrap items-center justify-end gap-2">
      {canManage && stats.pendingParseCount > 0 ? (
        <button
          type="button"
          data-testid="stat-pending-parse"
          disabled={busy}
          className={cn(statCardClass, statWarningClass, 'disabled:opacity-60')}
          onClick={actions.onBatchParse}
        >
          <StatInline
            icon={<FileText size={16} />}
            value={String(stats.pendingParseCount)}
            label="待解析"
          />
        </button>
      ) : null}

      {canManage && stats.pendingIndexCount > 0 ? (
        <button
          type="button"
          data-testid="stat-pending-index"
          disabled={busy}
          className={cn(statCardClass, statWarningClass, 'disabled:opacity-60')}
          onClick={actions.onBatchIndex}
        >
          <StatInline
            icon={<DatabaseIcon size={16} />}
            value={String(stats.pendingIndexCount)}
            label="待入库"
          />
        </button>
      ) : null}

      <button
        type="button"
        data-testid="stat-file-count"
        disabled={!stats.hasVirtualFolders || !canManage}
        title={
          stats.hasVirtualFolders && canManage
            ? '存在历史虚拟文件夹，点击转换'
            : undefined
        }
        className={cn(
          statCardClass,
          stats.hasVirtualFolders && statWarningClass,
        )}
        onClick={actions.onConvertVirtualFolders}
      >
        <StatInline
          icon={
            stats.hasVirtualFolders ? (
              <CircleAlert size={16} />
            ) : (
              <FileText size={16} />
            )
          }
          value={String(stats.fileCount)}
          label="文件"
        />
      </button>

      {stats.sizeText ? (
        <div className={statCardClass}>
          <StatInline
            icon={<DatabaseIcon size={16} />}
            value={stats.sizeText}
            label=""
          />
        </div>
      ) : null}

      {canManage ? (
        <button
          type="button"
          data-testid="stat-repair-chunks"
          aria-label=" Chunk/Token 统计"
          title=" Chunk/Token 统计"
          aria-busy={repairing || undefined}
          disabled={repairing}
          className={cn(statCardClass, statRepairClass, 'disabled:opacity-72')}
          onClick={actions.onRepairStats}
        >
          <StatInline
            // 修复中换成转圈的图标；平时这块统计要自己说明它是什么
            icon={repairing ? <LoaderCircle size={16} /> : <Blocks size={16} />}
            value={stats.chunkText}
            label="Chunks"
            spinning={repairing}
          />
        </button>
      ) : (
        <div className={statCardClass}>
          <StatInline
            icon={<Blocks size={16} aria-hidden />}
            value={stats.chunkText}
            label="Chunks"
          />
        </div>
      )}

      {canManage ? (
        <button
          type="button"
          data-testid="stat-repair-tokens"
          aria-label=" Chunk/Token 统计"
          title=" Chunk/Token 统计"
          aria-busy={repairing || undefined}
          disabled={repairing}
          className={cn(statCardClass, statRepairClass, 'disabled:opacity-72')}
          onClick={actions.onRepairStats}
        >
          <StatInline
            icon={repairing ? <LoaderCircle size={16} /> : <Hash size={16} />}
            value={stats.tokenText}
            label="Tokens"
            spinning={repairing}
          />
        </button>
      ) : (
        <div className={statCardClass}>
          <StatInline
            icon={<Hash size={16} aria-hidden />}
            value={stats.tokenText}
            label="Tokens"
          />
        </div>
      )}
    </div>
  </div>
);
