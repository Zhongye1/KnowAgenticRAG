/** 虚拟文件夹转换弹窗。 */
import * as React from 'react';
import { Button, Modal, Progress } from 'antd';

import { knowledgeApi } from '../../../api/knowledge-api';

export type MigrationSnapshot = {
  status: string;
  progress?: number;
  message?: string;
};

/** 任务是否仍在跑（pending/running 期间按钮保持禁用，防止重复提交）。 */
export const isMigrationRunning = (snapshot: MigrationSnapshot | null) =>
  snapshot?.status === 'pending' || snapshot?.status === 'running';

export const VirtualFolderDialog = ({
  open,
  kbId,
  onOpenChange,
  onFinished,
  notify,
}: {
  open: boolean;
  kbId: string;
  onOpenChange: (open: boolean) => void;
  /** 终态后回调：调用方重新检测虚拟文件夹并刷新统计。 */
  onFinished: () => void;
  notify: (input: {
    type: 'success' | 'warning' | 'error';
    title: string;
    message?: string;
  }) => void;
}) => {
  const [snapshot, setSnapshot] = React.useState<MigrationSnapshot | null>(
    null,
  );
  const [starting, setStarting] = React.useState(false);
  // 组件只在 open 期间挂载（父级条件渲染），卸载即断流，因此不需要 abort 控制器

  const running = isMigrationRunning(snapshot);

  const consumeStream = React.useCallback(
    async (taskId: string) => {
      try {
        await knowledgeApi.streamVirtualFolderMigration(
          kbId,
          taskId,
          setSnapshot,
        );
        // 流自然结束（终态帧后端会收口）：重新检测并刷新统计
        onFinished();
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return;
        notify({
          type: 'warning',
          title: '进度连接已中断，转换任务会继续执行',
        });
      }
    },
    [kbId, notify, onFinished],
  );

  const start = async () => {
    setStarting(true);
    setSnapshot({ status: 'pending', progress: 0 });
    try {
      const { task_id } = await knowledgeApi.startVirtualFolderMigration(kbId);
      await consumeStream(task_id);
    } catch (error) {
      setSnapshot(null);
      notify({
        type: 'error',
        title: error instanceof Error ? error.message : '转换任务启动失败',
      });
    } finally {
      setStarting(false);
    }
  };

  const progress = Math.round(snapshot?.progress ?? 0);
  const progressStatus =
    snapshot?.status === 'failed'
      ? 'exception'
      : snapshot?.status === 'success'
        ? 'success'
        : 'active';

  return (
    <Modal
      open={open}
      title="转换历史虚拟文件夹"
      onCancel={() => onOpenChange(false)}
      footer={
        <>
          <Button htmlType="button" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button
            htmlType="button"
            type="primary"
            loading={starting}
            disabled={running}
            onClick={() => void start()}
          >
            开始转换
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="m-0">
          该知识库存在历史兼容数据创建的虚拟文件夹，需要转换为真实目录结构。
        </p>
        <p className="m-0">
          转换按批次提交；关闭弹窗或进度连接中断不会撤销已经完成的部分，再次执行会从剩余数据继续。
        </p>
        {snapshot ? (
          <>
            <Progress percent={progress} status={progressStatus} />
            {snapshot.message ? (
              <p className="m-0 text-xs text-color-text-3">
                {snapshot.message}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
};
