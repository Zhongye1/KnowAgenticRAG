/**
 * 文件数变化时的示例问题生命周期。
 *
 * 对齐参照 `DataBaseInfoView.vue` 的 watcher（`:830-869`）：首次观察到的文件数只是加载，
 * 不算新增；之后文件数变化时——大于 0、当前账号可管理、且知识库打开了
 * `auto_generate_questions`——延迟一会儿静默生成一次（等后台把文件记录建出来）。文件归零
 * 或不可管理时反过来清掉列表面。
 *
 * 挂在页面上而不是面板里：分区未激活时面板不会挂载，触发放在面板里就只有在用户点开过
 * 检索测试分区之后才会生效。参照那次「分区还没挂载就再等 2 秒」的重试因此在**本仓不需要**。
 *
 * 「清空」在参照里清的是组件内的本地数组；本仓示例问题住在查询缓存里，所以这里把缓存
 * 置成空数组——面板读同一份缓存，因此同样在下次取数前保持为空（与参照的「刷新会回来」一致）。
 */
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  knowledgeKeys,
  useGenerateSampleQuestions,
  useKnowledgeBase,
} from './knowledge-queries';

/** 生成前的等待：文件记录的建立是后台任务（参照的 3000ms）。 */
export const AUTO_GENERATE_DELAY_MS = 3000;

/** 清空前的等待（参照的 1000ms）。 */
export const CLEAR_QUESTIONS_DELAY_MS = 1000;

export type AutoSampleQuestionsOptions = {
  /** 当前账号可管理这个知识库（参照的 `canManageDatabase`）。 */
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
    // 数据到达时的真实值看起来像一次新增（参照的 watcher 也是在 database 有值之后才跑）
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
