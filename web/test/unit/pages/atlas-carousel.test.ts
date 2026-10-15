/**
 * 首页 3D 数据图轮播的下标推进。
 *
 * 画布本身依赖 `getContext('2d')` 与图片像素，jsdom 里跑不起来（见 `test/setup-tests.ts`
 * 的 canvas 桩说明），所以推进与回绕这段纯计算单独钉住。
 */
import { describe, expect, it } from 'vitest';

import { nextCarouselIndex } from '@/pages/home/lib/atlas-carousel';

describe('nextCarouselIndex', () => {
  it('按顺序推进', () => {
    expect(nextCarouselIndex(0, 3)).toBe(1);
    expect(nextCarouselIndex(1, 3)).toBe(2);
  });

  it('最后一张回到第一张', () => {
    expect(nextCarouselIndex(2, 3)).toBe(0);
    expect(nextCarouselIndex(1, 2)).toBe(0);
  });

  it('空列表停在 0，不产生 NaN 下标', () => {
    expect(nextCarouselIndex(0, 0)).toBe(0);
    expect(nextCarouselIndex(-1, 0)).toBe(0);
  });
});
