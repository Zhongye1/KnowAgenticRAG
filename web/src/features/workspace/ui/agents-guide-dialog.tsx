/** `Agents 目录说明` 弹窗。 */
import { Modal } from 'antd';

import styles from './agents-guide-dialog.module.css';

type AgentsGuideDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const AgentsGuideDialog = ({
  open,
  onOpenChange,
}: AgentsGuideDialogProps) => (
  <Modal
    open={open}
    title="Agents 目录说明"
    okText="我知道了"
    cancelButtonProps={{ style: { display: 'none' } }}
    onCancel={() => onOpenChange(false)}
    onOk={() => onOpenChange(false)}
  >
    <div className={styles.content}>
      <p>
        这个文件夹中的说明文件会在合适的时机注入到 Agent
        的执行流程中，用来补充你的长期偏好、业务背景和协作要求。
      </p>
      <p>
        目前支持 <code>AGENTS.md</code>、<code>USER.md</code> 和
        <code>MEMORY.md</code>：其中内容会在每次会话中注入到 Agent
        Prompt，分别适合写入行为约束、用户信息和希望 Agent 记住的信息。
      </p>

      <section className={styles.section}>
        <h3>填写建议</h3>
        <ul>
          <li>写清常用工作背景，例如部门职责、常见任务、知识库使用方式。</li>
          <li>写清回答偏好，例如语言风格、详略程度、是否优先给结论。</li>
          <li>写清业务术语和固定称呼，帮助 Agent 保持表达一致。</li>
          <li>
            写清资料使用要求，例如优先引用哪些知识库、哪些内容需要谨慎确认。
          </li>
          <li>
            写清协作边界，例如不确定时先提问，涉及重要决策时先给方案再执行。
          </li>
          <li>优先使用明确、可执行的规则，避免“尽量做好”这类模糊描述。</li>
        </ul>
      </section>
    </div>
  </Modal>
);
