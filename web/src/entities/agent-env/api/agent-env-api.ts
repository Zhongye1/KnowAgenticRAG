/**
 * 用户沙盒环境变量端点。
 *
 * 只走契约生成的 SDK。GET/PUT 都是 `{env: Record<string,string>}`，整存整取；响应类型复用生成物
 * `AgentEnvResponse`。写入验证（键名/数量/长度）由后端 `validate_agent_env` 负责，前端只透传。
 */
import { unwrap } from '@/shared/api';
import {
  getAgentEnvApiUserAgentEnvGet,
  updateAgentEnvApiUserAgentEnvPut,
} from '@/shared/api/generated/sdk.gen';
import type { AgentEnvResponse } from '@/shared/api/generated/types.gen';

/** 当前用户的沙盒环境变量（键值对 + 更新时间）。 */
export type AgentEnv = {
  env: Record<string, string>;
  updatedAt: string | null;
};

const asTextMap = (value: unknown): Record<string, string> => {
  if (typeof value !== 'object' || value === null) return {};
  const source = value as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (typeof entry === 'string') result[key] = entry;
  }

  return result;
};

export async function getAgentEnv(): Promise<AgentEnv> {
  const payload = unwrap<AgentEnvResponse>(
    await getAgentEnvApiUserAgentEnvGet(),
  );

  return {
    env: asTextMap(payload.env),
    updatedAt:
      typeof payload.updated_at === 'string' ? payload.updated_at : null,
  };
}

/** 整体保存沙盒环境变量；响应是保存后的状态。 */
export async function updateAgentEnv(input: {
  env: Record<string, string>;
}): Promise<AgentEnv> {
  const payload = unwrap<AgentEnvResponse>(
    await updateAgentEnvApiUserAgentEnvPut({ body: { env: input.env } }),
  );

  return {
    env: asTextMap(payload.env),
    updatedAt:
      typeof payload.updated_at === 'string' ? payload.updated_at : null,
  };
}
