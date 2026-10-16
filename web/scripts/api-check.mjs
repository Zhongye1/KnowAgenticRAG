/**
 * 生成物漂移检查：用入库的 `openapi.json` 重新生成，与提交的 `src/shared/api/generated/` 逐文件比对。
 *
 * 不一致说明「改了契约或后端却没重新生成」，退出码 1。
 *
 * 两个实现细节：
 * - 生成与格式化参数取自 `openapi.config.mjs`，与 `api:gen` 同源；
 * - 临时目录放在仓库外。prettier 会读取 `.gitignore`，把临时目录放在仓库内
 *   并在 `.gitignore` 中忽略它，会导致 prettier 静默跳过、格式差异被误报成契约漂移。
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GENERATED_OUTPUT,
  OPENAPI_PLUGINS,
  OPENAPI_SNAPSHOT,
} from '../openapi.config.mjs';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const committedDir = path.join(rootDir, GENERATED_OUTPUT);
const tempDir = mkdtempSync(path.join(tmpdir(), 'ars-web-api-check-'));

/** 列出目录下所有文件的相对路径。 */
function listFiles(dir, prefix = '') {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory()
      ? listFiles(path.join(dir, entry.name), relative)
      : [relative];
  });
}

try {
  execFileSync(
    process.execPath,
    [
      path.join(rootDir, 'node_modules/@hey-api/openapi-ts/bin/run.js'),
      '-i',
      OPENAPI_SNAPSHOT,
      '-o',
      tempDir,
      '-p',
      ...OPENAPI_PLUGINS,
      '--silent',
    ],
    { cwd: rootDir, stdio: 'inherit' },
  );

  // `-o` 覆盖输出目录时会丢掉配置里的 postProcess，这里补上同一份 prettier 配置。
  // 忽略清单指到空文件：`.prettierignore` 的裸模式 `tmp` 会匹配任意路径段叫 tmp 的目录，
  // 而临时目录就在系统 tmp 下，沿用仓库的忽略清单会让 prettier 静默跳过全部生成文件，
  // 把它们未格式化的原样当成契约漂移。
  const ignorePath = `${tempDir}-prettierignore`;
  writeFileSync(ignorePath, '');
  execFileSync(
    process.execPath,
    [
      path.join(rootDir, 'node_modules/prettier/bin/prettier.cjs'),
      '--config',
      path.join(rootDir, '.prettierrc'),
      '--ignore-path',
      ignorePath,
      '--log-level',
      'warn',
      '--write',
      tempDir,
    ],
    { cwd: rootDir, stdio: 'inherit' },
  );

  const committed = listFiles(committedDir).sort();
  const regenerated = listFiles(tempDir).sort();

  const problems = [];
  for (const file of regenerated) {
    if (!committed.includes(file)) {
      problems.push(`新增未提交：${file}`);
      continue;
    }
    const expected = readFileSync(path.join(tempDir, file), 'utf8');
    const actual = readFileSync(path.join(committedDir, file), 'utf8');
    if (expected !== actual) {
      problems.push(`内容不一致：${file}`);
    }
  }
  for (const file of committed) {
    if (!regenerated.includes(file)) {
      problems.push(`已提交但不再生成：${file}`);
    }
  }

  if (problems.length > 0) {
    console.error('契约生成物已漂移，请执行 `pnpm run api:gen` 后提交：');
    for (const problem of problems.slice(0, 20))
      console.error(`  - ${problem}`);
    if (problems.length > 20) console.error(`  …共 ${problems.length} 处`);
    process.exitCode = 1;
  } else {
    console.log(`契约生成物一致：${regenerated.length} 个文件`);
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
  rmSync(`${tempDir}-prettierignore`, { force: true });
}
