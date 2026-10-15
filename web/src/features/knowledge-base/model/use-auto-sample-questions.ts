/** 文件数变化时的示例问题生命周期。 */
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  knowledgeKeys,
  useGenerateSampleQuestions,
  useKnowledgeBase,
} from './knowledge-queries';

/** 生成前的等待：文件记录的建立是后台任务。 */
export const AUTO_GENERATE_DELAY_MS = 3000;

/** 清空前的等待。 */
export const CLEAR_QUESTIONS_DELAY_MS = 1000;

export type AutoSampleQuestionsOptions = {
  /** 当前账号可管理这个知识库。 */
  canManage: boolean;
};

export const useAutoSampleQuestions = (
  kbId: string,
  { canManage }: AutoSampleQuestionsOptions,
) => {
  const queryClient = useQueryClient();
  const database = useKnowledgeBase(kbId);
  const generate = useGenerateSampleQuestions(kbId);

  const fileCount = database.data?.stats.file_count ?? 0;
  // 知识库没打开自动生成时只是不生成，不影响清空分支
  const autoGenerate =
    database.data?.additional_params?.auto_generate_questions === true;

  // 上一次观察到的文件数；null 表示还没观察到第一份数据
  const previousFileCount = React.useRef<number | null>(null);

  // mutation 对象每次渲染都是新的，进依赖会让计时器不断重排；用 ref 取最新的调用
  const generateRef = React.useRef(generate.mutateAsync);
  React.useEffect(() => {
    generateRef.current = generate.mutateAsync;
  });

  React.useEffect(() => {
    // 详情还没到就先不动：此时 file_count 取到的是兜底的 0，把它记成「首次观察」会让
    // 数据到达时的真实值看起来像一次新增
    if (!database.data) return;

    if (previousFileCount.current === null) {
      previousFileCount.current = fileCount;
      return;
    }
    if (previousFileCount.current === fileCount) return;
    previousFileCount.current = fileCount;

    if (fileCount > 0 && canManage) {
      if (!autoGenerate) return;
      const timer = setTimeout(() => {
        void generateRef.current(undefined).catch(() => undefined);
      }, AUTO_GENERATE_DELAY_MS);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      queryClient.setQueryData(knowledgeKeys.sampleQuestions(kbId), []);
    }, CLEAR_QUESTIONS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [autoGenerate, canManage, database.data, fileCount, kbId, queryClient]);
};
