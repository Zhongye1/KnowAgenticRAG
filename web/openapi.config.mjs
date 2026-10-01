/**
 * 契约生成的共享参数。
 *
 * `openapi-ts.config.ts`（日常生成）与 `scripts/api-check.mjs`（漂移检查）
 * 共用这一份清单，避免两处各写一份插件列表而悄悄分叉。
 */
export const OPENAPI_PLUGINS = [
  '@hey-api/client-fetch',
  '@hey-api/typescript',
  '@hey-api/sdk',
  '@tanstack/react-query',
];

export const GENERATED_OUTPUT = 'src/shared/api/generated';

export const OPENAPI_SNAPSHOT = 'openapi.json';
