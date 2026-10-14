/**
 * 工具详情弹窗。
 *
 * 对齐参照 `ToolsCardList.vue` 的详情弹窗：描述、配置说明（有才显示）、分类、标签与参数表。
 * 参数表用原生 `table` + Tailwind 复刻参照的 antd 表格外观。
 */
import { FileText, List, Tag as TagIcon, Tags } from 'lucide-react';

import { Modal, Tag } from 'antd';

import type { Tool } from '@/entities/tool';

import { toolCategoryLabel } from '../lib/tool-view';

type ToolDetailDialogProps = {
  tool: Tool | null;
  onOpenChange: (open: boolean) => void;
};

export const ToolDetailDialog = ({
  tool,
  onOpenChange,
}: ToolDetailDialogProps) => (
  <Modal
    open={tool !== null}
    title={tool ? tool.name : '工具详情'}
    footer={null}
    width={640}
    onCancel={() => onOpenChange(false)}
  >
    {tool ? (
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
        <p className="text-sm text-color-text-2">
          {tool.description || '无描述'}
        </p>

        {tool.configGuide ? (
          <section className="flex flex-col gap-2">
            <h4 className="flex items-center gap-2 text-xs font-medium text-color-text-2">
              <FileText className="size-3.5" aria-hidden />
              配置说明
            </h4>
            <p className="whitespace-pre-line text-xs leading-relaxed text-color-text-3">
              {tool.configGuide}
            </p>
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <h4 className="flex items-center gap-2 text-xs font-medium text-color-text-2">
            <TagIcon className="size-3.5" aria-hidden />
            分类
          </h4>
          <div>
            <Tag>{toolCategoryLabel(tool.category)}</Tag>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h4 className="flex items-center gap-2 text-xs font-medium text-color-text-2">
            <Tags className="size-3.5" aria-hidden />
            标签
          </h4>
          <div className="flex flex-wrap gap-1">
            {tool.tags.length ? (
              tool.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)
            ) : (
              <span className="text-xs text-color-text-3">无</span>
            )}
          </div>
        </section>

        {tool.args.length ? (
          <section className="flex flex-col gap-2">
            <h4 className="flex items-center gap-2 text-xs font-medium text-color-text-2">
              <List className="size-3.5" aria-hidden />
              参数
            </h4>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-color-border-1 text-left text-color-text-3">
                  <th className="py-2 pr-3 font-medium">参数名</th>
                  <th className="w-20 py-2 pr-3 font-medium">类型</th>
                  <th className="py-2 font-medium">描述</th>
                </tr>
              </thead>
              <tbody>
                {tool.args.map((arg) => (
                  <tr
                    key={arg.name}
                    className="border-b border-color-border-1 last:border-0"
                  >
                    <td className="py-2 pr-3 font-mono text-color-text-1">
                      {arg.name}
                    </td>
                    <td className="py-2 pr-3 text-color-text-3">
                      {arg.type || 'any'}
                    </td>
                    <td className="py-2 text-color-text-2">
                      {arg.description || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
      </div>
    ) : null}
  </Modal>
);
