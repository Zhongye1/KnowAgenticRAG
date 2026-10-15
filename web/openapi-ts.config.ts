import { defineConfig } from '@hey-api/openapi-ts';

import {
  GENERATED_OUTPUT,
  OPENAPI_PLUGINS,
  OPENAPI_SNAPSHOT,
} from './openapi.config.mjs';

/**
 * 契约生成配置。
 *
 * - 输入是入库的 `web/openapi.json` 快照，生成物落在 `src/apis/generated/` 并提交。
 *   这样契约变更在 code review 里表现为生成物 diff，而不是口头同步。
 * - 生成器只产出类型与请求函数；token 注入、错误文案、401 处理留在 `src/apis/base.ts`。
 */
export default defineConfig({
  input: OPENAPI_SNAPSHOT,
  output: {
    path: GENERATED_OUTPUT,
    postProcess: ['prettier'],
  },
  plugins: OPENAPI_PLUGINS,
});
