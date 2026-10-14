/**
 * 设置弹窗（多分区外壳）。
 *
 * 对齐参照 `SettingsModal.vue` 的信息架构：左侧导航（图标 + 文案）+ 右侧内容区，分区按角色
 * 门控——账户设置 / API Keys / 环境变量对所有登录用户开放，基本设置 / OCR 配置 / 用户管理
 * 对管理员开放，部门管理只对超管开放；导航顺序与参照的桌面端一致（环境变量排在最后）。
 *
 * 与参照的显式偏离（见决策记录）：没有 Star 推广卡；内容单栏（参照的内容区占
 * `calc(100% - 176px)` 是为了给导航让位，本仓导航在弹窗内部左栏，内容区自适应）；
 * 分区条件渲染而不是参照的 `v-show` 保活，切回时会复用缓存并后台重取。
 */
import * as React from 'react';
import {
  CircleUser,
  KeyRound,
  ScanText,
  Settings,
  SquareTerminal,
  User,
  Users,
  X,
} from 'lucide-react';

import { Modal } from 'antd';

import { AccountSection } from '@/features/account-settings/@x/settings';
import { AgentEnvPanel } from '@/features/agent-env/@x/settings';
import { ApiKeysPanel } from '@/features/api-keys/@x/settings';
import { BasicSettingsPanel } from '@/features/basic-settings/@x/settings';
import { DepartmentManagementPanel } from '@/features/department-management/@x/settings';
import { OcrSettingsPanel } from '@/features/ocr-settings/@x/settings';
import { UserManagementPanel } from '@/features/user-management/@x/settings';
import { useIsAdmin, useIsSuperuser } from '@/entities/session';

import styles from './settings-modal.module.css';

/** 导航项的键；与参照的 tab 键同语义。 */
type SettingsTab =
  'account' | 'apiKeys' | 'base' | 'ocr' | 'user' | 'department' | 'agentEnv';

/**
 * 打开时落在哪个分区。
 *
 * 参照由调用方给 `initialTab`；它自己的用户菜单固定传 `account`，因此本仓固定账户设置。
 * 参照里 `isAdmin ? 'base'` 那条回退只在没有指定分区时生效，当前没有调用方走那条路径。
 */
const DEFAULT_TAB: SettingsTab = 'account';

type SettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
};

export const SettingsModal = ({
  open,
  onOpenChange,
  notifySuccess,
  notifyError,
}: SettingsModalProps) => {
  const [activeTab, setActiveTab] = React.useState<SettingsTab>(DEFAULT_TAB);
  const isAdmin = useIsAdmin();
  const isSuperuser = useIsSuperuser();

  // 每次打开都回到默认分区（参照在 visible 变化时 setActiveTab）
  React.useEffect(() => {
    if (open) setActiveTab(DEFAULT_TAB);
  }, [open]);

  const tabs: Array<{ key: SettingsTab; label: string }> = [
    { key: 'account', label: '账户设置' },
    { key: 'apiKeys', label: 'API Keys' },
    ...(isAdmin
      ? [
          { key: 'base' as const, label: '基本设置' },
          { key: 'ocr' as const, label: 'OCR 配置' },
          { key: 'user' as const, label: '用户管理' },
        ]
      : []),
    ...(isSuperuser ? [{ key: 'department' as const, label: '部门管理' }] : []),
    { key: 'agentEnv', label: '环境变量' },
  ];

  const panelProps = {
    notifySuccess,
    notifyError,
  } as const;

  return (
    <Modal
      open={open}
      // 无标题栏、无 antd 关闭钮：参照的弹窗 `title={null}` + `closable={false}`，
      // 关闭钮自绘在左上角（见 `.closeButton`）
      title={null}
      closable={false}
      footer={null}
      width={980}
      onCancel={() => onOpenChange(false)}
      // 外壳自带内边距与圆角：antd 默认给 `.ant-modal-content` 20px/24px 内边距，
      // 留着会让导航栏缩在弹窗中间而不是贴着左边缘
      styles={{
        content: { padding: 0, borderRadius: 12, overflow: 'hidden' },
        body: { padding: 0 },
      }}
    >
      <div className={styles.shell}>
        <button
          type="button"
          className={styles.closeButton}
          aria-label="关闭设置"
          onClick={() => onOpenChange(false)}
        >
          <X size={16} aria-hidden />
        </button>

        <nav className={styles.sider} aria-label="设置分区">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`${styles.siderItem} ${
                activeTab === tab.key ? styles.siderItemActive : ''
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              <TabIcon tab={tab.key} />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className={styles.content}>
          {activeTab === 'account' ? (
            <AccountSection active={open} {...panelProps} />
          ) : null}
          {activeTab === 'apiKeys' ? <ApiKeysPanel {...panelProps} /> : null}
          {activeTab === 'agentEnv' ? (
            <AgentEnvPanel active={open} {...panelProps} />
          ) : null}
          {activeTab === 'base' ? <BasicSettingsPanel {...panelProps} /> : null}
          {activeTab === 'ocr' ? <OcrSettingsPanel {...panelProps} /> : null}
          {activeTab === 'user' ? (
            <UserManagementPanel {...panelProps} />
          ) : null}
          {activeTab === 'department' ? (
            <DepartmentManagementPanel {...panelProps} />
          ) : null}
        </div>
      </div>
    </Modal>
  );
};

const TabIcon = ({ tab }: { tab: SettingsTab }) => {
  if (tab === 'account') return <CircleUser size={18} aria-hidden />;
  if (tab === 'apiKeys') return <KeyRound size={18} aria-hidden />;
  if (tab === 'base') return <Settings size={18} aria-hidden />;
  if (tab === 'ocr') return <ScanText size={18} aria-hidden />;
  if (tab === 'user') return <User size={18} aria-hidden />;
  if (tab === 'department') return <Users size={18} aria-hidden />;

  return <SquareTerminal size={18} aria-hidden />;
};
