/**
 * 知识导图分区：markmap 渲染 + 生成 / 增量更新 / 差异提示。
 *
 * 加载态 → 生成中 → 空态（可生成）→ 导图与工具栏（重新生成 / 增量更新 / 适应视图）；差异检测
 * 决定增量入口是否出现，只把成功响应的 `mindmap: null` 当空态（404 与「不存在」照常报错）。
 *
 * markmap 配色指到 `tokens.css` 的 Token 上，`html.dark` 一换色就跟着变；实例与 `<svg>` 元素
 * 一一对应，元素被卸载重建后在新元素上重建实例，数据变化也是重建再 `setData`。
 */
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Map as MapIcon,
  Maximize2,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Empty as SharedEmpty } from '@/shared/ui/empty';
import { PanelStateBox } from '../panel-state';
import { Button, Spin } from 'antd';
import { useNotifications } from '@/shared/ui/notifications';
import type { Markmap as MarkmapInstance } from 'markmap-view';

import type { MindmapNode } from '../../api/mindmap-api';
import {
  canIncrementalUpdate,
  hasMindmap,
  mindmapAddedCount,
  mindmapToMarkdown,
  summarizeMindmapDiff,
} from '../../lib/mindmap-view';
import {
  mindmapKeys,
  useGenerateMindmap,
  useMindmap,
  useMindmapDiff,
} from '../../model/mindmap-queries';

/**
 * markmap 自带一套 `--markmap-*` 变量（只在系统级暗色偏好下换暗色），把它们指到 `tokens.css`
 * 的 Token 上：变量引用变量，`html.dark` 切换时文字与底色自动跟着走，不需要重建实例。
 */
const MARKMAP_VARIABLES: Array<[string, string]> = [
  ['--markmap-text-color', 'rgb(var(--color-text-1))'],
  ['--markmap-code-bg', 'rgb(var(--color-fill-2))'],
  ['--markmap-code-color', 'rgb(var(--color-text-2))'],
  ['--markmap-circle-open-bg', 'rgb(var(--color-bg-1))'],
  ['--markmap-a-color', 'rgb(var(--link-6))'],
];

const applyMarkmapVariables = (svg: SVGSVGElement) => {
  for (const [name, value] of MARKMAP_VARIABLES) {
    svg.style.setProperty(name, value);
  }
};

/** 把导图树渲染成嵌套列表，作为 SVG 的文本替代。 */
const MindmapOutline = ({ node }: { node?: MindmapNode | null }) => {
  if (!node?.content) return null;
  return (
    <ul>
      <li>
        {node.content}
        {(node.children ?? []).length > 0 ? (
          <ul>
            {(node.children ?? []).map((child, index) => (
              <MindmapOutline key={`${child.content}-${index}`} node={child} />
            ))}
          </ul>
        ) : null}
      </li>
    </ul>
  );
};

export type KnowledgeMindmapPanelProps = {
  kbId: string;
  readOnly: boolean;
  /** 当前分区是否激活。 */
  active: boolean;
};

export const KnowledgeMindmapPanel = ({
  kbId,
  readOnly,
  active,
}: KnowledgeMindmapPanelProps) => {
  const notifications = useNotifications();
  const queryClient = useQueryClient();
  const documentQuery = useMindmap(kbId);
  const hasData = hasMindmap(documentQuery.data?.mindmap);
  const diff = useMindmapDiff(kbId, hasData);
  const generate = useGenerateMindmap(kbId);
  /**
   * 真实的 `<svg>` 元素。
   *
   * 必须用 state 接住它、而不是 `ref.current`：生成中分支会把整个数据分支（连同 `<svg>`）
   * 卸载，回到数据分支时 React 挂的是**新元素**，只依赖 Markdown 的 effect 不会重跑，
   * 画布就会空着（且旧实例还挂在脱离文档的元素上）。
   */
  const [svgElement, setSvgElement] = React.useState<SVGSVGElement | null>(
    null,
  );
  const markmapRef = React.useRef<MarkmapInstance | null>(null);
  const [renderError, setRenderError] = React.useState('');

  const markdown = React.useMemo(
    () => mindmapToMarkdown(documentQuery.data?.mindmap),
    [documentQuery.data],
  );

  React.useEffect(() => {
    if (!svgElement || !markdown) return;
    let cancelled = false;
    let instance: MarkmapInstance | null = null;

    const render = async () => {
      try {
        // markmap 只在这个分区用得到，动态引入让详情页其它分区不必为它付包体
        const [markmapView, markmapLib] = await Promise.all([
          import('markmap-view'),
          import('markmap-lib'),
        ]);
        if (cancelled) return;

        applyMarkmapVariables(svgElement);
        const { root } = new markmapLib.Transformer().transform(markdown);
        instance = markmapView.Markmap.create(svgElement, {
          // 布局参数取值：长文件名按 200px 折行，
          // 层间距 60/5，行高 24——用 markmap 默认（不折行、80/8、16）观感差别明显
          duration: 300,
          maxWidth: 200,
          nodeMinHeight: 24,
          paddingX: 8,
          spacingVertical: 5,
          spacingHorizontal: 60,
          // 这里让 autoFit 承担同一件事：数据每次渲染后自动适应视图
          autoFit: true,
        });
        markmapRef.current = instance;
        await instance.setData(root);
        if (!cancelled) setRenderError('');
      } catch (error) {
        if (!cancelled) {
          setRenderError(
            error instanceof Error ? error.message : '思维导图解析失败。',
          );
        }
      }
    };
    void render();

    return () => {
      cancelled = true;
      markmapRef.current = null;
      instance?.destroy();
    };
  }, [svgElement, markdown]);

  /*
   * 切回分区时重新取数并重算差异：面板被 antd 常驻（切走不卸载），应用的查询客户端又关掉了
   * 窗口聚焦重取、`staleTime` 是 60 秒——不主动失效的话，离开期间新增/删除的文件不会反映到
   * 「增量更新」角标上。
   */
  const firstActivation = React.useRef(true);
  React.useEffect(() => {
    if (firstActivation.current) {
      firstActivation.current = false;
      return;
    }
    if (!active) return;
    void queryClient.invalidateQueries({ queryKey: mindmapKeys.all });
  }, [active, queryClient]);

  const notifyFailure = (error: unknown, fallback: string) =>
    notifications.addNotification({
      type: 'error',
      title: '知识导图',
      message: error instanceof Error ? error.message : fallback,
    });

  const runGenerate = async (incremental: boolean) => {
    try {
      const result = await generate.mutateAsync({ incremental });
      notifications.addNotification({
        type: 'success',
        title: '知识导图',
        message: incremental
          ? result.no_ai_needed
            ? '思维导图已更新（自动清理已删除文件）。'
            : '增量更新完成。'
          : '思维导图生成成功。',
      });
    } catch (error) {
      notifyFailure(error, incremental ? '增量更新失败。' : '生成失败。');
    }
  };

  if (documentQuery.isLoading) {
    return (
      <PanelStateBox>
        <p className="flex items-center gap-2 text-sm text-color-text-2">
          <Spin />
          加载中…
        </p>
      </PanelStateBox>
    );
  }

  if (documentQuery.isError) {
    return (
      <PanelStateBox>
        <p role="alert" className="text-sm text-danger-6">
          加载思维导图失败：
          {documentQuery.error instanceof Error
            ? documentQuery.error.message
            : '未知错误'}
        </p>
        <Button
          htmlType="button"
          variant="outlined"
          onClick={() => void documentQuery.refetch()}
        >
          <RefreshCw className="size-4" />
          重试
        </Button>
      </PanelStateBox>
    );
  }

  if (generate.isPending) {
    return (
      <PanelStateBox>
        <p className="flex items-center gap-2 text-sm text-color-text-2">
          <Spin />
          AI 正在生成思维导图…
        </p>
      </PanelStateBox>
    );
  }

  if (!hasData) {
    return (
      <PanelStateBox>
        <SharedEmpty
          icon={MapIcon}
          description={
            readOnly
              ? '思维导图尚未生成，请等待知识库管理员生成后查看。'
              : '从当前知识库内容生成结构化导图。'
          }
          action={
            readOnly ? null : (
              <Button htmlType="button" onClick={() => void runGenerate(false)}>
                <Sparkles className="size-4" />
                生成思维导图
              </Button>
            )
          }
        />
      </PanelStateBox>
    );
  }

  const addedCount = mindmapAddedCount(diff.data);
  const diffSummary = summarizeMindmapDiff(diff.data);

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-[8px] border border-[var(--gray-150)] bg-[var(--gray-0)]`}
    >
      {/* 工具栏：右上对齐、gray-0 底、底部 1px 分隔线、按钮无边框 */}
      <div
        className={`flex flex-wrap items-center gap-2 border-b border-[var(--gray-150)] bg-[var(--gray-0)] px-3 py-2 ${
          diffSummary ? 'justify-between' : 'justify-end'
        }`}
      >
        {diffSummary ? (
          <span className="text-xs text-color-text-3">
            与上次生成相比：{diffSummary}
          </span>
        ) : null}
        <div className="flex items-center gap-1">
          {readOnly ? null : (
            <Button
              htmlType="button"
              variant="text"
              title="重新生成"
              disabled={generate.isPending}
              onClick={() => void runGenerate(false)}
            >
              <RefreshCw className="size-4" />
              重新生成
            </Button>
          )}
          {!readOnly && canIncrementalUpdate(diff.data) ? (
            <Button
              htmlType="button"
              variant="text"
              title="增量更新"
              disabled={generate.isPending}
              onClick={() => void runGenerate(true)}
            >
              <Plus className="size-4" />
              增量更新
              {addedCount > 0 ? (
                <span className="ml-1 rounded bg-primary-1 px-1 text-xs text-primary-6">
                  {addedCount}
                </span>
              ) : null}
            </Button>
          ) : null}
          <Button
            htmlType="button"
            variant="text"
            title="适应视图"
            onClick={() => void markmapRef.current?.fit()}
          >
            <Maximize2 className="size-4" />
            适应视图
          </Button>
        </div>
      </div>

      {renderError ? (
        <p role="alert" className="px-3 pt-2 text-sm text-danger-6">
          思维导图渲染失败：{renderError}
        </p>
      ) : null}

      <div className="relative h-[520px] w-full overflow-hidden">
        {/* markmap 画的是可折叠 SVG 树且对 AT 隐藏，这里用嵌套列表把整棵树讲出来 */}
        <div className="sr-only">
          <p>知识导图结构：</p>
          <MindmapOutline node={documentQuery.data?.mindmap} />
        </div>
        <svg
          ref={setSvgElement}
          data-testid="mindmap-svg"
          aria-hidden="true"
          className="h-full w-full"
        />
      </div>
    </div>
  );
};
