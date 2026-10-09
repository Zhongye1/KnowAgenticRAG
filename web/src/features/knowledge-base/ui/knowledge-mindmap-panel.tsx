/**
 * 知识导图分区：markmap 渲染 + 生成 / 增量更新 / 差异提示。
 *
 * 移植上游 `MindMapSection.vue`：加载态 → 生成中 → 空态（可生成）→ 导图与工具栏
 * （重新生成 / 增量更新 / 适应视图），差异检测决定增量入口是否出现。
 *
 * 与上游的差异：
 * 1) 上游为 Safari 写了整套 SVG 文本兜底（自己量文字、断行、画 `<text>`，约 200 行）；
 *    本仓面向 Chromium/Firefox，不移植这套兜底，`foreignObject` 在这些浏览器正常。
 * 2) 上游把 404 与「不存在」也当成「还没生成」静默处理；本仓只把成功响应的 `mindmap: null`
 *    当空态，其它错误照常显示，避免把真故障伪装成「去生成一张」。
 * 3) 主题联动不靠重建：markmap 的配色来自 `--markmap-*` CSS 变量，这里把它们指到
 *    `tokens.css` 的 Token 上，`html.dark` 一换色文字与底色自己跟着变。
 * 4) markmap 实例与 `<svg>` 元素一一对应：effect 依赖「真实元素 + Markdown」两者，元素被
 *    卸载重建（生成中分支会整块替换）后会在新元素上重建实例，旧实例随之销毁。
 *    数据变化是重建实例再 `setData`，不是在同一实例上增量更新——markmap 的实例与元素绑定，
 *    换内容也换不掉这层绑定。
 * 5) 与上游的 markmap 选项差异：不传 `maxWidth`/`nodeMinHeight`/`paddingX`/`spacing*`（用
 *    markmap 默认值），`duration` 用 200ms（上游 300ms），并开启 `autoFit`。
 * 6) 差异检测失败时增量入口静默消失（与上游一致），因为差异只是「要不要给增量按钮」的提示，
 *    不是数据来源；导图本身失败仍会照常报错。
 * 7) markmap 与 markmap-lib 用动态 import：它们只在这个分区渲染时才需要，静态引入会让
 *    「打开任一知识库详情页」都多下 ~150 kB（gzip）。
 */
import * as React from 'react';
import {
  Map as MapIcon,
  Maximize2,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import type { Markmap as MarkmapInstance } from 'markmap-view';

import type { MindmapNode } from '../api/mindmap-api';
import {
  canIncrementalUpdate,
  hasMindmap,
  mindmapAddedCount,
  mindmapToMarkdown,
  summarizeMindmapDiff,
} from '../lib/mindmap-view';
import {
  useGenerateMindmap,
  useMindmap,
  useMindmapDiff,
} from '../model/mindmap-queries';
import { Button } from '@/shared/ui/button';
import { Empty } from '@/shared/ui/empty';
import { Spinner } from '@/shared/ui/spinner';
import { useNotifications } from '@/shared/ui/notifications';

/**
 * markmap 自带一套 `--markmap-*` 变量（并且只在系统级暗色偏好下换暗色），这里指到本仓 Token 上：
 * 变量引用变量，`html.dark` 切换时文字与底色自动跟着走，不需要重建实例。
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
};

export const KnowledgeMindmapPanel = ({
  kbId,
  readOnly,
}: KnowledgeMindmapPanelProps) => {
  const notifications = useNotifications();
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
          autoFit: true,
          duration: 200,
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
      <div className="flex h-[520px] items-center justify-center gap-2 text-sm text-color-text-2">
        <Spinner />
        加载中…
      </div>
    );
  }

  if (documentQuery.isError) {
    return (
      <div className="flex h-[520px] flex-col items-center justify-center gap-3">
        <p role="alert" className="text-sm text-danger-6">
          加载思维导图失败：
          {documentQuery.error instanceof Error
            ? documentQuery.error.message
            : '未知错误'}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void documentQuery.refetch()}
        >
          <RefreshCw className="size-4" />
          重试
        </Button>
      </div>
    );
  }

  if (generate.isPending) {
    return (
      <div className="flex h-[520px] items-center justify-center gap-2 text-sm text-color-text-2">
        <Spinner />
        AI 正在生成思维导图…
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="flex h-[520px] flex-col items-center justify-center gap-1 rounded-large border border-color-border-1">
        <p className="text-sm font-medium text-color-text-1">暂无思维导图</p>
        <Empty
          icon={MapIcon}
          description={
            readOnly
              ? '思维导图尚未生成，请等待知识库管理员生成后查看。'
              : '从当前知识库内容生成结构化导图。'
          }
          action={
            readOnly ? null : (
              <Button type="button" onClick={() => void runGenerate(false)}>
                <Sparkles className="size-4" />
                生成思维导图
              </Button>
            )
          }
        />
      </div>
    );
  }

  const addedCount = mindmapAddedCount(diff.data);
  const diffSummary = summarizeMindmapDiff(diff.data);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {readOnly ? null : (
          <Button
            type="button"
            variant="outline"
            disabled={generate.isPending}
            onClick={() => void runGenerate(false)}
          >
            <RefreshCw className="size-4" />
            重新生成
          </Button>
        )}
        {!readOnly && canIncrementalUpdate(diff.data) ? (
          <Button
            type="button"
            variant="outline"
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
          type="button"
          variant="outline"
          onClick={() => void markmapRef.current?.fit()}
        >
          <Maximize2 className="size-4" />
          适应视图
        </Button>
        {diffSummary ? (
          <span className="text-xs text-color-text-3">
            与上次生成相比：{diffSummary}
          </span>
        ) : null}
      </div>

      {renderError ? (
        <p role="alert" className="text-sm text-danger-6">
          思维导图渲染失败：{renderError}
        </p>
      ) : null}

      <div className="relative h-[520px] w-full overflow-hidden rounded-large border border-color-border-1 bg-color-bg-1">
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
