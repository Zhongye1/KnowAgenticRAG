#!/usr/bin/env node
/**
 * 设计 Token 使用规范校验（pnpm check:tokens）
 *
 * 规则：
 *  1. src 下 .ts/.tsx（排除 generated/testing）禁止出现：
 *     - 硬编码颜色：#hex / rgb() / rgba() / hsl() / hsla()
 *     - Tailwind 默认调色板类：bg-white、text-gray-500、border-blue-600 等
 *  2. src 下 .css 禁止出现硬编码颜色（token 文件 src/styles/** 除外）。
 *
 * 所有颜色必须引用 Arco 设计 Token（见 src/styles/tokens.css）：
 *   bg-primary-6 / text-color-text-2 / border-color-border-1 / ...
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

const IGNORED_DIRS = new Set(['generated', 'testing', 'node_modules', 'dist']);
const TOKEN_CSS_DIR = join(SRC, 'styles');

// 装饰 / 插画类 CSS：自带完整的亮暗两套配色（天空、光效、深色展示墙等），
// 不属于主题语义色，豁免硬编码颜色校验。
const CSS_DECORATIVE_EXEMPT = new Set([
  'components/ui/DayNightSwitcher/day-night-switcher.css',
  'features/auth/components/DriftWall/DriftWall.css',
]);
// 主题基座文件（shadcn 语义色、@theme 映射）允许硬编码基础颜色值
const CSS_THEME_EXEMPT = new Set(['index.css']);

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
// 允许 rgb(var(--x)) / hsl(var(--x)) 这类 Token 引用，禁止硬编码颜色值
const RGB_RE = /\b(rgba?|hsla?)\(\s*(?!var\()/i;

const PALETTE_PREFIXES =
  'bg|text|border|ring|accent|fill|stroke|divide|placeholder|decoration|caret|outline|from|to|via|shadow';
const PALETTE_NAMES =
  'gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black';
const PALETTE_CLASS_RE = new RegExp(
  `(?<![\\w-])\\b(?:${PALETTE_PREFIXES})-(${PALETTE_NAMES})(?=\\b|[/-]|["'\`\\s])`,
);

const issues = [];

function checkCode(file, content, allowHexInComments = false) {
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    if (HEX_RE.test(line)) {
      issues.push(
        `${file}:${lineNo}  硬编码 HEX 颜色 ${line.trim().slice(0, 80)}`,
      );
    }
    if (RGB_RE.test(line)) {
      issues.push(
        `${file}:${lineNo}  硬编码 rgb()/hsl() 颜色 ${line.trim().slice(0, 80)}`,
      );
    }
    if (PALETTE_CLASS_RE.test(line)) {
      issues.push(
        `${file}:${lineNo}  Tailwind 默认调色板类 ${line.trim().slice(0, 80)}`,
      );
    }
  });
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    const rel = relative(SRC, full);
    if (
      rel.includes(`${sep}generated${sep}`) ||
      rel.includes(`${sep}testing${sep}`)
    )
      continue;

    if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      checkCode(relative(process.cwd(), full), readFileSync(full, 'utf8'));
    } else if (
      full.endsWith('.css') &&
      !full.startsWith(TOKEN_CSS_DIR + sep) &&
      !CSS_DECORATIVE_EXEMPT.has(rel) &&
      !CSS_THEME_EXEMPT.has(rel)
    ) {
      checkCode(relative(process.cwd(), full), readFileSync(full, 'utf8'));
    }
  }
}

walk(SRC);

if (issues.length > 0) {
  console.error(`\n✗ 设计 Token 规范校验失败（${issues.length} 处违规）：`);
  console.error(
    '  颜色必须引用 src/styles/tokens.css 中的 Token 工具类，例如：',
  );
  console.error('    bg-primary-6 / text-color-text-2 / border-color-border-1');
  console.error(
    '    success/warning/danger/link-N、data-N、color-bg/fill/text-N',
  );
  console.error('');
  for (const issue of issues) console.error(`  - ${issue}`);
  process.exit(1);
}

console.log('✓ 设计 Token 规范校验通过：未发现硬编码颜色或默认调色板类。');
