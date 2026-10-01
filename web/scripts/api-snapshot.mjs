/**
 * 契约快照：把运行中后端的 OpenAPI 文档写入 `web/openapi.json`。
 *
 * 该文件入库，因此 `git diff web/openapi.json` 就是「后端这次改了什么接口」。
 * 目标地址可用 `ARS_OPENAPI_URL` 覆盖（容器内指向服务名）。
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.env.ARS_OPENAPI_URL ?? 'http://localhost:5050/openapi.json';
const target = path.join(rootDir, 'openapi.json');

const response = await fetch(source);
if (!response.ok) {
  console.error(`契约快照失败：${source} 返回 HTTP ${response.status}`);
  process.exit(1);
}

const spec = await response.json();
const serialized = `${JSON.stringify(spec, null, 2)}\n`;
writeFileSync(target, serialized, 'utf8');

const pathCount = Object.keys(spec.paths ?? {}).length;
const endpointCount = Object.values(spec.paths ?? {}).reduce(
  (total, operations) => total + Object.keys(operations).length,
  0,
);
console.log(
  `已写入 openapi.json：${pathCount} 条路径 / ${endpointCount} 个端点 / ${(serialized.length / 1024).toFixed(0)} KB`,
);
