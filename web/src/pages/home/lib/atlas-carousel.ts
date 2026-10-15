/**
 * 首页 3D 数据图的轮播下标。
 *
 * 画布逻辑依赖 `getContext('2d')`，在 jsdom 里跑不起来；推进与回绕这段纯计算抽出来
 * 单独可测。
 */

/** 下一张的下标，越界回绕；空列表返回 0。 */
export const nextCarouselIndex = (current: number, total: number): number => {
  if (total <= 0) return 0;
  return (current + 1) % total;
};
