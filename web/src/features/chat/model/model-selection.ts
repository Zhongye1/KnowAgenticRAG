/**
 * 对话页的模型选择。
 *
 * 覆盖按会话记（草稿态用一个固定键），只活在页面会话里——与参照一致：刷新后由后端绑定在会话
 * 上的 `metadata.model_spec` 接手，前端不自己持久化这次选择。
 *
 * 模型列表与系统默认模型分两条查询：后者属于管理面，读不到时只表示「没有系统默认」。
 */
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';

import { listChatModels } from '../api/model-api';
import { DRAFT_MODEL_KEY, modelOverrideKey } from '../lib/model-spec';

export const modelKeys = {
  chatModels: () => ['chat', 'models', 'chat'] as const,
};

type ModelSelectionState = {
  /** 会话 id（或草稿键）→ 选中的 spec。 */
  overrideByKey: Record<string, string>;
  /** 选中一个模型；传空串表示清空选择，回到默认。 */
  setOverride: (threadId: string | null | undefined, spec: string) => void;
  /** 新建会话后把草稿态的选择挪到会话上，免得刚选完就丢。 */
  promoteDraft: (threadId: string) => void;
};

export const useModelSelection = create<ModelSelectionState>((set) => ({
  overrideByKey: {},
  setOverride: (threadId, spec) =>
    set((state) => {
      const key = modelOverrideKey(threadId);
      const next = { ...state.overrideByKey };
      if (spec) next[key] = spec;
      else delete next[key];

      return { overrideByKey: next };
    }),
  promoteDraft: (threadId) =>
    set((state) => {
      const draft = state.overrideByKey[DRAFT_MODEL_KEY];
      if (!draft) return state;

      const next = { ...state.overrideByKey };
      // 草稿键一律清掉：它是「还没建会话时」的临时位，会话一建出来就不再成立
      delete next[DRAFT_MODEL_KEY];
      if (!next[threadId]) next[threadId] = draft;

      return { overrideByKey: next };
    }),
}));

/** 会话级覆盖；没有时返回空串。 */
export const useModelOverride = (threadId: string | null | undefined): string =>
  useModelSelection(
    (state) => state.overrideByKey[modelOverrideKey(threadId)] ?? '',
  );

/** 可选的对话模型列表，按供应商分组。 */
export const useChatModels = () =>
  useQuery({ queryKey: modelKeys.chatModels(), queryFn: listChatModels });
