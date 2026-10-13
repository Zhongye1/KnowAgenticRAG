import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * 导航项的层叠顺序必须与参照的 Less 编译结果一致。
 *
 * 参照的 `.nav-item` 是嵌套规则，编译后顺序为 `.nav-item.primary-action`(0,2,0) →
 * `.nav-item.primary-action:hover`(0,3,0) → `.nav-item:hover`(0,2,0) →
 * `.nav-item.active`(0,2,0)。本仓用扁平类名，同特异性时靠源码顺序决胜：
 *
 * - 悬停中的主操作项由三元素的 `primaryAction:hover` 胜出；
 * - 未悬停的激活主操作项由 `active` 胜出（与 `primaryAction` 同特异性且更靠后）；
 * - 激活的普通项被悬停时由 `active` 胜出（与 `hover` 同特异性且更靠后）。
 *
 * 顺序写反时 `/agent` 上的「新建对话」会渲染成主操作外观，而参照给的是激活外观。
 */
const cssPath = join(
  process.cwd(),
  'src/widgets/app-sidebar/ui/app-sidebar.module.css',
);

/** 规则在选择器里出现的下标；找不到时抛错，避免断言在改名后静默失效。 */
const ruleIndex = (css: string, selector: string): number => {
  const index = css.indexOf(`${selector} {`);

  expect(index, `未找到规则 ${selector}`).toBeGreaterThan(-1);
  return index;
};

describe('导航项的层叠顺序', () => {
  const css = readFileSync(cssPath, 'utf8');

  it('四条规则的源码顺序与参照的 Less 编译结果一致', () => {
    const primary = ruleIndex(css, '.navItem.primaryAction');
    const primaryHover = ruleIndex(css, '.navItem.primaryAction:hover');
    const hover = ruleIndex(css, '.navItem:hover');
    const active = ruleIndex(css, '.navItem.navItemActive');

    expect(primaryHover).toBeGreaterThan(primary);
    expect(hover).toBeGreaterThan(primaryHover);
    expect(active).toBeGreaterThan(hover);
  });

  it('主操作的悬停态是三个元素，压过两元素的激活态', () => {
    // `.nav-item.primary-action:hover` 三元素 vs `.nav-item.active` 两元素；
    // 因此悬停中的主操作显示 hover 外观，而不是激活外观。
    expect(css).toContain('.navItem.primaryAction:hover {');
    expect(css).toContain('.navItem.navItemActive {');
  });
});
