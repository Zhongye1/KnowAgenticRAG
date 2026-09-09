/**
 * 知识库领域类型统一由 OpenAPI 生成的 IDL（src/generated/types.ts）提供，
 * 这里只做面向 feature 的语义别名转发，禁止手写与后端重复的结构定义。
 */
export type {
  KBItem as KnowledgeBase,
  KBDetail as KnowledgeBaseDetail,
  KBOverview as KnowledgeBaseOverview,
  KBCreateParam as CreateKnowledgeBaseDTO,
  KBUpdateParam as UpdateKnowledgeBaseDTO,
  KBDeleteResponse,
  KBCollectionsItem,
  KBFacetItem,
  KBFormatDistributionItem,
  KBIngestionVolumeItem,
  DocumentItem,
  DocumentUpdateParam,
  PageData,
} from '@/generated/types';
