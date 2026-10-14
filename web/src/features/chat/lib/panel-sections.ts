/**
 * 右侧面板的分区模型。
 *
 * 面板是受控的：`sections` 与 `activeSectionKey` 由调用方持有，面板只负责渲染与发事件。
 * 这里放的是两份纯逻辑——增改分区，以及关闭分区后选中项落到哪里。
 */

export type PanelSection = {
  key: string;
  /** 分区类型决定图标与内容渲染。 */
  type: 'file-tree' | 'file' | 'message-debug' | 'subagent';
  title: string;
  /** `file` 类型带的路径。 */
  path?: string;
  /** `file` 类型来自哪套文件系统；缓存查找要用它。 */
  scope?: 'thread' | 'workspace';
  /** `subagent` 类型带的子线程 id 与 run 信息。 */
  threadId?: string;
  runId?: string;
  runStatus?: string;
};

/** 消息调试分区；`key` 与 `type` 同名，便于按类型查找。 */
export const MESSAGE_DEBUG_SECTION: PanelSection = {
  key: 'message-debug',
  type: 'message-debug',
  title: '调试',
};

/** 文件树分区；常驻，不给关闭入口。 */
export const FILE_TREE_SECTION: PanelSection = {
  key: 'file-tree',
  type: 'file-tree',
  title: '文件',
};

/** 丢掉没有 `key` 或 `type` 的条目；它们无法被激活也无法渲染。 */
export function normalizeSections(
  sections: PanelSection[] | null | undefined,
): PanelSection[] {
  return (sections ?? []).filter((section) =>
    Boolean(section?.key && section?.type),
  );
}

/** 新增或就地更新一个分区；按 `key` 匹配，保留原有位置。 */
export function upsertSection(
  sections: PanelSection[] | null | undefined,
  section: PanelSection,
): PanelSection[] {
  const current = sections ?? [];
  const index = current.findIndex((item) => item.key === section.key);
  if (index < 0) return [...current, section];

  return current.map((item, itemIndex) =>
    itemIndex === index ? { ...item, ...section } : item,
  );
}

/**
 * 关闭一个分区，并给出关闭后应该激活哪个。
 *
 * 关掉的不是当前分区时选中项不动；关掉的正是当前分区时，选中落到**接替它位置的那一个**
 * （原下标处），越界则落到最后一个；全关光了就置空。
 */
export function closeSection(
  sections: PanelSection[],
  activeKey: string,
  closingKey: string,
): { sections: PanelSection[]; activeKey: string } {
  const closingIndex = sections.findIndex(
    (section) => section.key === closingKey,
  );
  if (closingIndex < 0) return { sections, activeKey };

  const nextSections = sections.filter((section) => section.key !== closingKey);
  if (activeKey !== closingKey) return { sections: nextSections, activeKey };

  const nextActive =
    nextSections[Math.min(closingIndex, nextSections.length - 1)];

  return { sections: nextSections, activeKey: nextActive?.key ?? '' };
}
