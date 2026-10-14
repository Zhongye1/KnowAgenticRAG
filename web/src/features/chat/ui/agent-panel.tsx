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
import {
  Bug,
  FileText,
  Folders,
  Maximize2,
  Minimize2,
  PanelRight,
  X,
} from 'lucide-react';
import styles from './agent-panel.module.css';

import { normalizeSections, type PanelSection } from '../lib/panel-sections';

/** 拖动开始的位移阈值（px）：小于它算单击，不改宽度也不点亮把手。 */
const RESIZE_START_THRESHOLD_PX = 3;

const SECTION_ICONS = {
  'file-tree': Folders,
  file: FileText,
  'message-debug': Bug,
  subagent: Folders,
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
  const normalized = React.useMemo(
    () => normalizeSections(sections),
    [sections],
  );
  const [resizing, setResizing] = React.useState(false);
  // 视觉上的「正在拖动」：只有指针真的移动过才点亮把手，单击不该闪一下
  const [dragging, setDragging] = React.useState(false);
  const frameRef = React.useRef(0);
  const pendingXRef = React.useRef(0);
  const startXRef = React.useRef(0);
  const movedRef = React.useRef(false);

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
      // 先取消排队的那一帧：它若在 endResize 之后执行，会把已经清零的锚点当成「第一次移动」，
      // 重新写回 dragWidth，面板就永远停在「拖拽中」
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
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
    (event: PointerEvent) => {
      // 越过起点阈值才算开始拖：单击把手不该把面板宽度跳到点击位置
      if (!movedRef.current) {
        if (
          Math.abs(event.clientX - startXRef.current) <
          RESIZE_START_THRESHOLD_PX
        ) {
          return;
        }
        movedRef.current = true;
        setDragging(true);
      }
      queueResize(event.clientX);
    },
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
    // 只记起点，先不改宽度：等指针越过阈值再开始（见 handlePointerMove）
    startXRef.current = event.clientX;
    movedRef.current = false;
  };

  return (
    <aside className={styles.shell} style={{ width }} aria-label="侧边栏">
      {!maximized ? (
        <div
          /* 竖向拖拽把手：`hr` 是横向分隔符，承载不了拖拽，因此用带 role 的 div */
          /* eslint-disable-next-line jsx-a11y/prefer-tag-over-role */
          role="separator"
          aria-orientation="vertical"
          aria-label="调整侧边栏宽度"
          className={`${styles.resizeHandle} ${dragging ? styles.resizeHandleActive : ''}`}
          onPointerDown={startResize}
        />
      ) : null}

      <div className={styles.header}>
        <div
          className={styles.sectionTabs}
          role="tablist"
          aria-label="侧边栏内容"
        >
          {normalized.map((section, index) => {
            const Icon = SECTION_ICONS[section.type] ?? Folders;
            const active = section.key === activeSectionKey;

            return (
              <React.Fragment key={section.key}>
                {index > 0 ? (
                  <span aria-hidden className={styles.sectionTabDivider} />
                ) : null}
                {/* 激活态挂在外层：底色由它给，挂在按钮上会被 .sectionTabMain 的
                    background: transparent 盖掉（参照里这个类也在外层） */}
                <div
                  className={`${styles.sectionTab} ${
                    active ? styles.sectionTabActive : ''
                  }`}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    title={section.title}
                    className={styles.sectionTabMain}
                    onClick={() => onActivateSection(section.key)}
                  >
                    <Icon className={styles.sectionTabIcon} aria-hidden />
                    <span className={styles.sectionTabTitle}>
                      {section.title}
                    </span>
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
              </React.Fragment>
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
