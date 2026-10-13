/**
 * 右侧面板的外壳。
 *
 * 受控组件：分区列表与当前分区由调用方持有，这里只渲染标签栏与操作按钮，并把用户的
 * 动作发回去。内容由调用方通过 `children` 传入——面板不关心某个分区里是什么。
 *
 * 拖拽调宽只往外发指针横坐标（rAF 节流），宽度换算由调用方按容器宽度算，因为只有它
 * 知道容器有多宽。
 */
import * as React from 'react';
import { Bug, FileText, Folders, Gauge, Maximize2, Minimize2, PanelRight, X } from 'lucide-react';
import styles from './agent-panel.module.css';

import { normalizeSections, type PanelSection } from '../lib/panel-sections';

const SECTION_ICONS = {
  'file-tree': Folders,
  file: FileText,
  'message-debug': Bug,
  subagent: Folders,
  state: Gauge,
} as const;

type AgentPanelProps = {
  /**
   * 按分区渲染内容；返回 `undefined` 表示该分区用 `children` 兜底。
   *
   * 面板自己不持有文件系统与预览的状态：它是受控的，内容由调用方给。调试分区没有自己的状态，
   * 继续走 children。
   */
  renderSection?: (section: PanelSection) => React.ReactNode | undefined;
  sections: PanelSection[];
  activeSectionKey: string;
  /** 最大化时隐藏拖拽把手，也不能再拖。 */
  maximized?: boolean;
  /** 面板宽度；最大化时由调用方给 `100%`。 */
  width: number | string;
  onActivateSection: (key: string) => void;
  onCloseSection: (key: string) => void;
  onToggleMaximize: () => void;
  onClose: () => void;
  /** 拖拽中的指针横坐标；调用方据此换算宽度。 */
  onResize: (clientX: number) => void;
  /** 拖拽结束；调用方把拖拽期像素回写成持久比例。 */
  onResizeEnd?: () => void;
  children?: React.ReactNode;
};

export const AgentPanel = ({
  renderSection,
  sections,
  activeSectionKey,
  maximized = false,
  width,
  onActivateSection,
  onCloseSection,
  onToggleMaximize,
  onClose,
  onResize,
  onResizeEnd,
  children,
}: AgentPanelProps) => {
  const normalized = React.useMemo(() => normalizeSections(sections), [sections]);
  const [resizing, setResizing] = React.useState(false);
  const frameRef = React.useRef(0);
  const pendingXRef = React.useRef(0);

  // 指针每动一下都换算会打满主线程；按帧合并，只发最后一次的位置
  const queueResize = React.useCallback(
    (clientX: number) => {
      pendingXRef.current = clientX;
      if (frameRef.current) return;

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = 0;
        onResize(pendingXRef.current);
      });
    },
    [onResize],
  );

  const stopResize = React.useCallback(
    (event?: PointerEvent) => {
      setResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // 收尾顺序同参照 stopResize：先 flush 最后一次位置，再让调用方回写比例
      if (event) onResize(pendingXRef.current);
      onResizeEnd?.();
    },
    [onResize, onResizeEnd],
  );

  const handlePointerMove = React.useCallback(
    (event: PointerEvent) => queueResize(event.clientX),
    [queueResize],
  );

  React.useEffect(() => {
    if (!resizing) return;

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
    };
  }, [resizing, handlePointerMove, stopResize]);

  // 卸载时取消未执行的那一帧，避免对已卸载组件回调
  React.useEffect(
    () => () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || maximized) return;

    setResizing(true);
    // 拖拽期间保持整页的列宽光标与禁选，否则指针滑出把手就丢样式
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    event.currentTarget.setPointerCapture?.(event.pointerId);
    queueResize(event.clientX);
  };

  return (
    <aside
      className={styles.shell}
      style={{ width }}
      aria-label="侧边栏"
    >
      {!maximized ? (
        <div
          /* 竖向拖拽把手：`hr` 是横向分隔符，承载不了拖拽，因此用带 role 的 div */
          /* eslint-disable-next-line jsx-a11y/prefer-tag-over-role */
          role="separator"
          aria-orientation="vertical"
          aria-label="调整侧边栏宽度"
          className={`${styles.resizeHandle} ${resizing ? styles.resizeHandleActive : ''}`}
          onPointerDown={startResize}
        />
      ) : null}

      <div className={styles.header}>
        <div
          className={styles.sectionTabs}
          role="tablist"
          aria-label="侧边栏内容"
        >
          {normalized.map((section) => {
            const Icon = SECTION_ICONS[section.type] ?? Folders;
            const active = section.key === activeSectionKey;

            return (
              <div key={section.key} className={styles.sectionTab}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  title={section.title}
                  className={`${styles.sectionTabMain} ${active ? styles.sectionTabActive : ''}`}
                  onClick={() => onActivateSection(section.key)}
                >
                  <Icon className={styles.sectionTabIcon} aria-hidden />
                  <span className={styles.sectionTabTitle}>{section.title}</span>
                </button>
                {/* 文件树是常驻分区，不给关闭入口 */}
                {section.type !== 'file-tree' ? (
                  <button
                    type="button"
                    aria-label={`关闭 ${section.title}`}
                    className={styles.sectionTabClose}
                    onClick={() => onCloseSection(section.key)}
                  >
                    <X className={styles.sectionTabCloseIcon} aria-hidden />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className={styles.actionBtn}
          title={maximized ? '还原面板' : '最大化面板'}
          aria-label={maximized ? '还原面板' : '最大化面板'}
          disabled={resizing}
          onClick={onToggleMaximize}
        >
          {maximized ? (
            <Minimize2 className={styles.actionBtnIcon} aria-hidden />
          ) : (
            <Maximize2 className={styles.actionBtnIcon} aria-hidden />
          )}
        </button>
        <button
          type="button"
          className={styles.actionBtn}
          title="隐藏侧边栏"
          aria-label="隐藏侧边栏"
          onClick={onClose}
        >
          <PanelRight className={styles.actionBtnIcon} aria-hidden />
        </button>
      </div>

      <div className={styles.body}>
        {normalized.map((section) =>
          section.key === activeSectionKey ? (
            <div key={section.key} className={styles.sectionPane}>
              {renderSection ? (renderSection(section) ?? children) : children}
            </div>
          ) : null,
        )}
      </div>
    </aside>
  );
};
