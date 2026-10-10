/**
 * 鼠标轨迹装饰层（照搬参照实现 `mouse-trail.tsx`）。
 *
 * 与参照的差异：颜色不再写死在组件里，改成从页面 token `--home-trail` 解析，
 * 透明度用 `globalAlpha` 表达。`check-design-tokens.mjs` 对样式目录以外的颜色函数
 * 字面量零豁免（按文本扫描，注释同样命中），画布取色因此沿用
 * `features/dashboard/lib/chart-palette.ts` 的「CSS 变量交给浏览器解析后读回」做法。
 * 首页固定浅色，参照的暗色分支不保留。
 *
 * 来源：AI Website Cloner Template 0.6.1（MIT，JCodesMore）里的 AusVector 首页克隆。
 * 样式在 `src/styles/home.css`，作用域 `.home-site`。
 */
import { useEffect, useRef } from "react";

type TrailPoint = { x: number; y: number; life: number };

const TRAIL_LENGTH = 8;

/**
 * Full-viewport cursor trail drawn behind nothing and above everything
 * (`z-index: 100`, `pointer-events: none`). Constants and easing match the
 * live site: an 8-point history that decays by 0.88 per frame, hairline
 * segments between points, and a soft radial head under the cursor.
 */
export function MouseTrail() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const points: TrailPoint[] = [];
    let pointer = { x: -100, y: -100 };
    let frame = 0;

    // 从 `.home-site` 作用域里的 token 取轨迹色；取不到时不画（不给画布编造颜色）
    const trailColor = getComputedStyle(canvas)
      .getPropertyValue('--home-trail')
      .trim();
    if (!trailColor) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      points.unshift({ ...pointer, life: 1 });
      points.splice(TRAIL_LENGTH);
    };

    const onPointerLeave = () => {
      pointer = { x: -100, y: -100 };
    };

    const draw = () => {
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);

      points.forEach((point, index) => {
        point.life *= 0.88;
        const alpha = point.life * (1 - index / 10) * 0.34;
        context.beginPath();
        context.arc(point.x, point.y, Math.max(1, 2.4 - 0.2 * index), 0, Math.PI * 2);
        context.globalAlpha = alpha;
        context.fillStyle = trailColor;
        context.fill();
      });
      context.globalAlpha = 1;

      for (let index = points.length - 1; index > 0; index -= 1) {
        const point = points[index];
        const previous = points[index - 1];
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.lineTo(previous.x, previous.y);
        context.globalAlpha = 0.12 * point.life;
        context.strokeStyle = trailColor;
        context.lineWidth = 1;
        context.stroke();
      }

      context.globalAlpha = 1;

      if (pointer.x >= 0 && pointer.y >= 0) {
        const glow = context.createRadialGradient(
          pointer.x,
          pointer.y,
          0,
          pointer.x,
          pointer.y,
          34,
        );
        glow.addColorStop(0, trailColor);
        glow.addColorStop(1, "transparent");
        context.globalAlpha = 0.12;
        context.fillStyle = glow;
        context.beginPath();
        context.arc(pointer.x, pointer.y, 34, 0, Math.PI * 2);
        context.fill();

        context.globalAlpha = 0.72;
        context.beginPath();
        context.arc(pointer.x, pointer.y, 2.5, 0, Math.PI * 2);
        context.fillStyle = trailColor;
        context.fill();

        context.globalAlpha = 0.24;
        context.beginPath();
        context.arc(pointer.x, pointer.y, 8, 0, Math.PI * 2);
        context.strokeStyle = trailColor;
        context.lineWidth = 0.8;
        context.stroke();
      }

      context.globalAlpha = 1;

      frame = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    frame = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={canvasRef} className="mouse-trail" aria-hidden="true" />;
}
