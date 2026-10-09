/**
 * 生成客户端结果的公共折叠，服务所有手写 api 层（知识库切片与调试弹窗都用它）。
 *
 * 契约生成客户端返回 `{data, error, response}`，这里统一折成「值」或 `ApiError`；
 * 这些端点都没有 `response_model`，失败时既可能是非 2xx，也可能是
 * 200 + `{status:'failed', message}`，因此业务状态由各调用点自己判。
 *
 * 文案只认后端给出的 `detail`：网络层的 `TypeError` 是浏览器英文提示，不当文案
 * （与 `shared/api/base.ts` 的约定一致）。
 */
import { ApiError } from './base';

type Unwrap = { data?: unknown; error?: unknown; response?: Response };

/** 解包生成客户端的结果；`error` 非空即抛 `ApiError`（带 HTTP 状态与后端 detail）。 */
export const unwrap = <T>(result: Unwrap): T => {
  if (result.error !== undefined) {
    throw new ApiError(
      result.response?.status ?? 0,
      (result.error as { detail?: unknown })?.detail ?? result.error,
    );
  }
  return result.data as T;
};

/** 失败文案；非 `ApiError`（网络层异常）时用调用方给的兜底文案。 */
export const describeFailure = (error: unknown, fallback: string): string =>
  error instanceof ApiError ? error.message : fallback;

/**
 * 后台任务受理：只有 `queued` 算被受理，其余抛出后端给出的原因。
 * 后端在提交异常时返回 200 + `{status:'failed', message}`，不判会静默当成成功。
 */
export const unwrapQueuedTask = <
  T extends { status: string; message?: string },
>(
  result: T,
  fallback: string,
): T => {
  if (result.status !== 'queued') {
    throw new Error(result.message || fallback);
  }
  return result;
};
