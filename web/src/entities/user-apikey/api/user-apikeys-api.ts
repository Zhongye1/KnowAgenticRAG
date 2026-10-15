/**
 * 用户 API Key 端点。
 *
 * 只走契约生成的 SDK，请求与响应契约里都有 schema（`ApiKeyCreate` / `ApiKeyUpdate` /
 * `APIKeyResponse`），直接用生成类型。列表响应没有声明模型，按不可信数据归一。
 */
import { unwrap } from '@/shared/api';
import {
  createApiKeyApiUserApikeyPost,
  deleteApiKeyApiUserApikeyApiKeyIdDelete,
  listApiKeysApiUserApikeyGet,
  updateApiKeyApiUserApikeyApiKeyIdPut,
} from '@/shared/api/generated/sdk.gen';

/** 更新载荷；契约 schema `ApiKeyUpdate`（启停用）。 */
export type ApiKeyUpdate = {
  name?: string | null;
  expires_at?: string | null;
  is_enabled?: boolean | null;
};

/** 一条 API Key 的展示形状（`ApiKeyResponse` 里与本界面相关的字段）。 */
export type ApiKeyItem = {
  id: number;
  name: string;
  /** 掩码前缀（如 `arskey_abcd`）；完整密钥只在创建响应里出现一次。 */
  keyPrefix: string;
  isEnabled: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
};

/** 创建后的响应；`secret` 是完整密钥，服务端不会再返回第二次。 */
export type ApiKeyCreated = {
  id: number;
  secret: string;
};

const asIso = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : null;

/** 列表响应按不可信数据归一：缺 id 的条目丢掉。 */
export async function listApiKeys(): Promise<ApiKeyItem[]> {
  const payload = unwrap<{ api_keys?: unknown }>(
    await listApiKeysApiUserApikeyGet({ query: { skip: 0, limit: 100 } }),
  );
  const items = Array.isArray((payload as { api_keys?: unknown }).api_keys)
    ? ((payload as { api_keys: unknown[] }).api_keys as Record<
        string,
        unknown
      >[])
    : [];

  const result: ApiKeyItem[] = [];
  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null) continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.id !== 'number') continue;

    result.push({
      id: item.id,
      name: typeof item.name === 'string' ? item.name : '',
      keyPrefix: typeof item.key_prefix === 'string' ? item.key_prefix : '',
      isEnabled: item.is_enabled === true,
      expiresAt: asIso(item.expires_at),
      lastUsedAt: asIso(item.last_used_at),
    });
  }

  return result;
}

/** 创建一个 API Key。 */
export async function createApiKey(input: {
  requestId: string;
  name: string;
  expiresAt?: string;
}): Promise<ApiKeyCreated> {
  const body = {
    request_id: input.requestId,
    name: input.name,
    ...(input.expiresAt ? { expires_at: input.expiresAt } : {}),
  };
  const payload = unwrap<Record<string, unknown>>(
    await createApiKeyApiUserApikeyPost({ body }),
  );
  const id = typeof payload.id === 'number' ? payload.id : 0;
  const secret = typeof payload.secret === 'string' ? payload.secret : '';
  if (!secret) {
    throw new Error('创建失败：响应里没有密钥');
  }

  return { id, secret };
}

/** 更新一个 API Key（当前界面只用启停）。 */
export async function updateApiKey(
  id: number,
  input: ApiKeyUpdate,
): Promise<void> {
  unwrap<unknown>(
    await updateApiKeyApiUserApikeyApiKeyIdPut({
      path: { api_key_id: id },
      body: input,
    }),
  );
}

/** 删除一个 API Key。 */
export async function deleteApiKey(id: number): Promise<void> {
  unwrap<unknown>(
    await deleteApiKeyApiUserApikeyApiKeyIdDelete({ path: { api_key_id: id } }),
  );
}
