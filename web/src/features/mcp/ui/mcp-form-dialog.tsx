/** MCP 表单弹窗（新建与编辑共用）。 */
import * as React from 'react';

import { Form, Input, InputNumber, Modal, Select } from 'antd';

import {
  useCreateMcpServer,
  useUpdateMcpServer,
  type McpServer,
} from '@/entities/mcp';
import { describeFailure } from '@/shared/api';

import {
  MCP_TRANSPORTS,
  mcpFormFromServer,
  parseMcpHeaders,
  validateMcpForm,
  type McpFormValues,
} from '../lib/mcp-view';

const EMPTY_FORM: McpFormValues = {
  slug: '',
  name: '',
  description: '',
  transport: 'streamable_http',
  url: '',
  headersText: '',
  timeout: null,
  sseReadTimeout: null,
  tags: [],
  icon: '',
};

type McpFormDialogProps = {
  open: boolean;
  /** 传入即编辑，null 为新建。 */
  server: McpServer | null;
  onOpenChange: (open: boolean) => void;
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
};

export const McpFormDialog = ({
  open,
  server,
  onOpenChange,
  notifySuccess,
  notifyError,
}: McpFormDialogProps) => {
  const editing = server !== null;
  const [saving, setSaving] = React.useState(false);

  // 表单值是「按当前目标算出的基准」叠加本次打开的编辑草稿：基准由 server 派生，不用 effect
  // 同步；关闭或提交成功后把草稿清空，下次打开就回到基准（编辑带出已保存值，新建回到空表）。
  const [draft, setDraft] = React.useState<Partial<McpFormValues>>({});
  const base = server ? mcpFormFromServer(server) : EMPTY_FORM;
  const values: McpFormValues = { ...base, ...draft };
  const change = (patch: Partial<McpFormValues>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const createMutation = useCreateMcpServer();
  const updateMutation = useUpdateMcpServer();

  const close = () => {
    setDraft({});
    onOpenChange(false);
  };

  const submit = async () => {
    const error = validateMcpForm(values, { editing });
    if (error) {
      notifyError(error);
      return;
    }

    const { headers } = parseMcpHeaders(values.headersText);
    const payload = {
      name: values.name.trim(),
      description: values.description.trim(),
      transport: values.transport,
      url: values.url.trim(),
      headers,
      timeout: values.timeout,
      sseReadTimeout: values.sseReadTimeout,
      tags: values.tags,
      icon: values.icon.trim(),
    };

    setSaving(true);
    try {
      if (server) {
        await updateMutation.mutateAsync({ slug: server.slug, input: payload });
        notifySuccess('MCP 更新成功');
      } else {
        await createMutation.mutateAsync({
          ...payload,
          slug: values.slug.trim(),
        });
        notifySuccess('MCP 创建成功');
      }

      close();
    } catch (failure) {
      notifyError(describeFailure(failure, '操作失败'));
    } finally {
      setSaving(false);
    }
  };

  const httpTransport = MCP_TRANSPORTS.includes(
    values.transport as (typeof MCP_TRANSPORTS)[number],
  );

  return (
    <Modal
      open={open}
      title={editing ? '编辑 MCP' : '添加 MCP'}
      width={560}
      maskClosable={false}
      confirmLoading={saving}
      onOk={() => void submit()}
      onCancel={close}
    >
      <Form layout="vertical">
        <Form.Item
          label="MCP 标识"
          htmlFor="mcp-slug"
          required
          className="mb-4"
        >
          <Input
            id="mcp-slug"
            value={values.slug}
            disabled={editing}
            placeholder="请输入 MCP 稳定标识，如 my-mcp"
            onChange={(event) => change({ slug: event.target.value })}
          />
        </Form.Item>

        <Form.Item
          label="MCP 名称"
          htmlFor="mcp-name"
          required
          className="mb-4"
        >
          <Input
            id="mcp-name"
            value={values.name}
            placeholder="请输入 MCP 展示名称"
            onChange={(event) => change({ name: event.target.value })}
          />
        </Form.Item>

        <Form.Item label="描述" htmlFor="mcp-description" className="mb-4">
          <Input
            id="mcp-description"
            value={values.description}
            placeholder="请输入 MCP 描述"
            onChange={(event) => change({ description: event.target.value })}
          />
        </Form.Item>

        <div className="grid grid-cols-2 gap-4">
          <Form.Item
            label="传输类型"
            htmlFor="mcp-transport"
            required
            className="mb-4"
          >
            <Select
              id="mcp-transport"
              value={values.transport}
              onChange={(transport) => change({ transport })}
              options={MCP_TRANSPORTS.map((transport) => ({
                value: transport,
                label: transport,
              }))}
            />
          </Form.Item>

          <Form.Item label="图标" htmlFor="mcp-icon" className="mb-4">
            <Input
              id="mcp-icon"
              value={values.icon}
              maxLength={2}
              placeholder="输入 emoji，如 🧠"
              onChange={(event) => change({ icon: event.target.value })}
            />
          </Form.Item>
        </div>

        {httpTransport ? (
          <>
            <Form.Item
              label="MCP URL"
              htmlFor="mcp-url"
              required
              className="mb-4"
            >
              <Input
                id="mcp-url"
                value={values.url}
                placeholder="https://example.com/mcp"
                onChange={(event) => change({ url: event.target.value })}
              />
            </Form.Item>

            <Form.Item
              label="HTTP 请求头"
              htmlFor="mcp-headers"
              className="mb-4"
            >
              <Input.TextArea
                id="mcp-headers"
                rows={3}
                value={values.headersText}
                placeholder='JSON 格式，如：{"Authorization": "Bearer xxx"}'
                onChange={(event) =>
                  change({ headersText: event.target.value })
                }
              />
            </Form.Item>

            <div className="grid grid-cols-2 gap-4">
              <Form.Item
                label="HTTP 超时（秒）"
                htmlFor="mcp-timeout"
                className="mb-4"
              >
                <InputNumber
                  id="mcp-timeout"
                  className="w-full"
                  min={1}
                  max={300}
                  value={values.timeout}
                  onChange={(timeout) => change({ timeout })}
                />
              </Form.Item>

              <Form.Item
                label="SSE 读取超时（秒）"
                htmlFor="mcp-sse-timeout"
                className="mb-4"
              >
                <InputNumber
                  id="mcp-sse-timeout"
                  className="w-full"
                  min={1}
                  max={300}
                  value={values.sseReadTimeout}
                  onChange={(sseReadTimeout) => change({ sseReadTimeout })}
                />
              </Form.Item>
            </div>
          </>
        ) : null}

        <Form.Item label="标签" htmlFor="mcp-tags" className="mb-0">
          <Select
            id="mcp-tags"
            mode="tags"
            className="w-full"
            value={values.tags}
            placeholder="输入标签后回车添加"
            onChange={(tags) => change({ tags })}
            options={[]}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};
