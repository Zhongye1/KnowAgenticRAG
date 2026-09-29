import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { SampleQuestionParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 设置示例问题（整字段替换） */
export type PutSampleQuestionsParams = {
  kb_name: string | number;
  data: SampleQuestionParam;
};

export const putSampleQuestions = (params: PutSampleQuestionsParams): Promise<string[]> => {
  const { kb_name, data } = params;
  return api.put(`/api/v1/knowledge_bases/${kb_name}/sample-questions`, data).then((res) => res.data);
};

type UsePutSampleQuestionsOptions = {
  mutationConfig?: MutationConfig<typeof putSampleQuestions>;
};

export const usePutSampleQuestions = ({ mutationConfig }: UsePutSampleQuestionsOptions = {}) => {
  return useMutation({
    mutationFn: putSampleQuestions,
    ...mutationConfig,
  });
};