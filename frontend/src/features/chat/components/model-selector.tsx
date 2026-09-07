import { useAui } from '@assistant-ui/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import {
  ModelSelectorContent,
  ModelSelectorRoot,
  ModelSelectorTrigger,
  ModelSelectorValue,
} from '@/components/assistant-ui/elements/model-selector.aui';
// useModelSelectorContext 仅由 kit 文件导出（.aui 包装层未再导出）
import { useModelSelectorContext } from '@/components/assistant-ui/elements/model-selector';
import { Button } from '@/components/ui/button';
import { listChatModelOptions } from '../api/model-providers';

/**
 * composer 内的模型选择器（assistant-ui model-selector 元素）：
 * 选中值/思考等级通过 ModelContext（config.modelName / config.reasoningEffort）
 * 注入每次 run，chat-adapter 读取后写入 ChatParam.model / thinking_level。
 * 未选择任何模型时不注册 context，后端走 RAGF_CHAT_MODEL_SPEC 缺省。
 */

const RegisterModelContext = () => {
  const { value, effort } = useModelSelectorContext();
  const aui = useAui();

  useEffect(() => {
    if (value === undefined) return;
    const context = {
      config: {
        modelName: value,
        ...(effort !== undefined ? { reasoningEffort: effort } : undefined),
      },
    };
    return aui.modelContext.register({
      getModelContext: () => context,
    });
  }, [aui, value, effort]);

  return null;
};

export const ChatModelSelector = () => {
  const { data: models, isLoading } = useQuery({
    queryKey: ['chat', 'model-options'],
    queryFn: listChatModelOptions,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled
        className="text-muted-foreground h-8 px-2.5 text-xs"
      >
        加载模型…
      </Button>
    );
  }

  if (!models?.length) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled
        className="text-muted-foreground h-8 px-2.5 text-xs"
        title="未配置可用 chat 模型，将使用系统默认"
      >
        默认模型
      </Button>
    );
  }

  return (
    <ModelSelectorRoot models={models} align="start">
      <RegisterModelContext />
      <ModelSelectorTrigger
        variant="ghost"
        size="sm"
        className="text-muted-foreground h-8 max-w-56 px-2.5 text-xs"
      >
        <ModelSelectorValue placeholder="选择模型" showEffort />
      </ModelSelectorTrigger>
      <ModelSelectorContent searchable />
    </ModelSelectorRoot>
  );
};
