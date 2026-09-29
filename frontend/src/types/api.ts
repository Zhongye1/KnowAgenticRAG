/**
 * 通用实体约束（`components/ui/table.tsx` 等列表组件用）。
 *
 * 业务类型一律来自 `src/generated/`（OpenAPI 产物），本文件只保留与具体接口无关的形状约束。
 */
export type BaseEntity = {
  id: string;
  createdAt: number;
};
