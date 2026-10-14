/**
 * ArkParticleAnimation：把 logo 图片采样成粒子并逐帧聚合的 canvas 动画。
 *
 * 来源：用户提供的 Vue3 单文件组件改写版，本仓按首页的需要收口如下（见
 * `web/alembic/pages/home/report.md`）：
 * - 去掉缩略图选项栏与它的点击切换，只保留粒子画布，改为按 `intervalMs` 自动轮播；
 * - 去掉内联 `<style>` 与其中的深色面板配色，画布尺寸与响应式交给页面样式
 *   （`styles/home-panels.css` 的 `.hero-atlas`）；
 * - 去掉内置的 SVG 示例 logo，`images` 成为必填：示例色是颜色字面量，而
 *   `check-design-tokens.mjs` 禁止 `src/**` 的 `.ts/.tsx` 出现颜色；
 * - 像素颜色改用十六进制拼接、透明度走 `globalAlpha`，同样是为了不出现颜色函数字面量；
 * - 采样图在画布内垂直居中，两张 logo 宽高比不同时切换不会跳；
 * - 指针坐标按画布的 CSS 缩放比换算：画布缓冲固定，窄屏下由 CSS 缩小；
 * - `prefers-reduced-motion: reduce` 时只画一次静态结果，不跑逐帧循环、不轮播、不挂指针监听。
 *
 * 画布是纯装饰，对辅助技术隐藏。
 *
 * `images` 用内容键参与依赖：调用方可以传内联数组，不会因为引用每次渲染都变而重建粒子。
 */
import * as React from 'react';

import { nextCarouselIndex } from '../lib/atlas-carousel';

export interface ArkParticleImage {
  /** logo 名称，参与图片内容键 */
  name: string;
  /** logo 图片地址，需支持跨域读取像素 */
  url: string;
}

export interface ArkParticleAnimationProps {
  /** logo 列表，按顺序轮播 */
  images: ArkParticleImage[];
  /** 画布宽度（像素） */
  width?: number;
  /** 画布高度（像素） */
  height?: number;
  /** 轮播间隔（毫秒） */
  intervalMs?: number;
}

/** 粒子运动到目标位置所需的帧数 */
const ANIMATE_TIME = 30;
/** 鼠标排斥作用半径 */
const REPULSION_RADIUS = 40;
/** 鼠标排斥力度 0~1 */
const REPULSION_INTENSITY = 0.95;

/**
 * 把图片像素的 RGB 分量拼成 canvas 颜色串。
 *
 * 颜色来自被采样的 logo 图片，不是设计色，因此不走页面 token；透明度用 `globalAlpha`
 * 表达，避免在代码里出现颜色函数字面量。
 */
const toPixelColor = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;

/* -------------------------------------------------------------------------
 *  Particle：粒子类
 *  记录粒子位置、颜色、大小、动画耗时以及 x/y 方向上的速度
 * ----------------------------------------------------------------------- */
class Particle {
  x: number;
  y: number;
  totalX: number;
  totalY: number;
  mx = 0;
  my = 0;
  vx = 0;
  vy = 0;
  time: number;
  r: number;
  color: number[];
  opacity: number;

  constructor(
    totalX: number,
    totalY: number,
    time: number,
    color: number[],
    width: number,
    height: number,
  ) {
    // 初始位置随机分布在整个画布范围
    this.x = (Math.random() * width) >> 0;
    this.y = (Math.random() * height) >> 0;
    this.totalX = totalX;
    this.totalY = totalY;
    this.time = time;
    this.r = 1.2;
    this.color = [...color];
    this.opacity = 0;
  }

  /** 在画布中绘制粒子 */
  draw(ctx: CanvasRenderingContext2D) {
    const [r, g, b, a] = this.color;
    ctx.globalAlpha = a / 255;
    ctx.fillStyle = toPixelColor(r, g, b);
    ctx.fillRect(this.x, this.y, this.r * 2, this.r * 2);
  }

  /**
   * 更新粒子状态
   * @param mouseX 鼠标 x 位置
   * @param mouseY 鼠标 y 位置
   * @param opacityStep 透明度递增步长
   * @param radius 排斥半径
   * @param intensity 排斥力度
   */
  update(
    mouseX: number | undefined,
    mouseY: number | undefined,
    opacityStep: number,
    radius: number,
    intensity: number,
  ) {
    // 计算粒子当前位置与目标位置之差，并按 time 帧分摊移动
    this.mx = this.totalX - this.x;
    this.my = this.totalY - this.y;
    this.vx = this.mx / this.time;
    this.vy = this.my / this.time;

    // 鼠标排斥力：距离越近，斥力越大（带阈值避免过大）
    if (mouseX && mouseY) {
      const dx = mouseX - this.x;
      const dy = mouseY - this.y;
      const distance = Math.sqrt(dx ** 2 + dy ** 2);
      if (distance > 0) {
        let disPercent = radius / distance;
        if (disPercent > 7) disPercent = 7;
        const angle = Math.atan2(dy, dx);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        this.vx += cos * disPercent * -intensity;
        this.vy += sin * disPercent * -intensity;
      }
    }

    this.x += this.vx;
    this.y += this.vy;
    if (this.opacity < 1) this.opacity += opacityStep;
  }

  /** 切换粒子目标位置与颜色 */
  change(x: number, y: number, color: number[]) {
    this.totalX = x;
    this.totalY = y;
    this.color = [...color];
  }
}

/* -------------------------------------------------------------------------
 *  LogoImg：logo 图片类
 *  通过临时 canvas 解析图片像素，按步长筛选得到粒子数组 particleData
 * ----------------------------------------------------------------------- */
class LogoImg {
  src: string;
  name: string;
  particleData: Particle[];
  /** 图片像素解析完成的回调 */
  onload?: () => void;
  /** 是否已完成像素解析（含加载失败） */
  ready = false;

  constructor(src: string, name: string, width: number, height: number) {
    this.src = src;
    this.name = name;
    this.particleData = [];

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    img.onload = () => {
      const tmpCanvas = document.createElement('canvas');
      const tmpCtx = tmpCanvas.getContext('2d');
      const imgW = width;
      const imgH = ~~(width * (img.height / img.width));
      // 宽高比与画布不一致的 logo 垂直居中，轮播切换时不会跳
      const offsetY = Math.max(0, (height - imgH) / 2);
      tmpCanvas.width = imgW;
      tmpCanvas.height = imgH;
      tmpCtx?.drawImage(img, 0, 0, imgW, imgH);
      const imgData = tmpCtx?.getImageData(0, 0, imgW, imgH).data;
      tmpCtx?.clearRect(0, 0, imgW, imgH);

      // 按 5px 步长采样，过滤掉过暗 / 过透的像素
      for (let y = 0; y < imgH; y += 5) {
        for (let x = 0; x < imgW; x += 5) {
          const index = (x + y * imgW) * 4;
          const r = imgData![index];
          const g = imgData![index + 1];
          const b = imgData![index + 2];
          const a = imgData![index + 3];
          const sum = r + g + b + a;
          if (sum >= 100) {
            this.particleData.push(
              new Particle(
                x,
                y + offsetY,
                ANIMATE_TIME,
                [r, g, b, a],
                width,
                height,
              ),
            );
          }
        }
      }

      this.ready = true;
      this.onload?.();
    };
    img.onerror = () => {
      // 图片加载失败时也触发回调，避免阻塞轮播
      this.ready = true;
      this.onload?.();
    };
  }
}

/* -------------------------------------------------------------------------
 *  ParticleCanvas：粒子画布类
 *  持有目标 canvas、粒子数组与鼠标位置，提供 drawCanvas 与 changeImg
 * ----------------------------------------------------------------------- */
class ParticleCanvas {
  canvasEle: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  particleArr: Particle[];
  mouseX?: number;
  mouseY?: number;
  animationFrameId: number | null = null;
  opacityStep: number;
  radius: number;
  intensity: number;
  animateTime: number;
  /** false 表示减少动效：只画一次静态结果，不跑逐帧循环 */
  animate: boolean;

  private handleMouseMove: (e: MouseEvent) => void;
  private handleMouseLeave: () => void;
  private drawCanvasBound: () => void;

  constructor(
    target: HTMLCanvasElement,
    width: number,
    height: number,
    animate: boolean,
  ) {
    this.canvasEle = target;
    this.ctx = target.getContext('2d') as CanvasRenderingContext2D;
    this.width = target.width;
    this.height = target.height;
    this.particleArr = [];
    this.opacityStep = 1 / ANIMATE_TIME;
    this.radius = REPULSION_RADIUS;
    this.intensity = REPULSION_INTENSITY;
    this.animateTime = ANIMATE_TIME;
    this.animate = animate;

    this.handleMouseMove = (e: MouseEvent) => {
      const rect = this.canvasEle.getBoundingClientRect();
      // 画布缓冲固定，窄屏下由 CSS 缩小，指针坐标要按缩放比换算回缓冲坐标
      const scaleX = rect.width ? this.canvasEle.width / rect.width : 1;
      const scaleY = rect.height ? this.canvasEle.height / rect.height : 1;
      this.mouseX = (e.clientX - rect.left) * scaleX;
      this.mouseY = (e.clientY - rect.top) * scaleY;
    };
    this.handleMouseLeave = () => {
      this.mouseX = 0;
      this.mouseY = 0;
    };
    this.drawCanvasBound = this.drawCanvas.bind(this);

    if (this.animate) {
      this.canvasEle.addEventListener('mousemove', this.handleMouseMove);
      this.canvasEle.addEventListener('mouseleave', this.handleMouseLeave);
    }
  }

  /** 切换 logo：首次直接赋值，非首次则复用已有粒子并随机映射新目标 */
  changeImg(img: LogoImg) {
    if (this.particleArr.length) {
      const newPrtArr = img.particleData;
      const newLen = newPrtArr.length;
      let arr = this.particleArr;
      const oldLen = arr.length;

      // 已存在的粒子调用 change 接收新属性；多出来的位置新建粒子
      for (let idx = 0; idx < newLen; idx++) {
        const { totalX, totalY, color } = newPrtArr[idx];
        if (arr[idx]) {
          arr[idx].change(totalX, totalY, color);
        } else {
          arr[idx] = new Particle(
            totalX,
            totalY,
            this.animateTime,
            color,
            this.width,
            this.height,
          );
        }
      }

      // 新粒子数组较小，删除多余粒子
      if (newLen < oldLen) this.particleArr = arr.splice(0, newLen);
      arr = this.particleArr;

      // 随机打乱粒子最终目标位置，使切换更自然
      let tmpLen = arr.length;
      while (tmpLen) {
        const randomIdx = ~~(Math.random() * tmpLen--);
        const randomPrt = arr[randomIdx];
        const { totalX: tx, totalY: ty, color } = randomPrt;
        randomPrt.totalX = arr[tmpLen].totalX;
        randomPrt.totalY = arr[tmpLen].totalY;
        randomPrt.color = arr[tmpLen].color;
        arr[tmpLen].totalX = tx;
        arr[tmpLen].totalY = ty;
        arr[tmpLen].color = color;
      }
    } else {
      this.particleArr = img.particleData.map(
        (item) =>
          new Particle(
            item.totalX,
            item.totalY,
            this.animateTime,
            item.color,
            this.width,
            this.height,
          ),
      );
    }

    // 静态模式没有后续帧，切换后直接把粒子放到目标位置画出来
    if (!this.animate) {
      this.particleArr.forEach((particle) => {
        particle.x = particle.totalX;
        particle.y = particle.totalY;
      });
      this.renderFrame();
    }
  }

  /** 画一帧：清屏 -> 更新 -> 绘制 */
  private renderFrame() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.particleArr.forEach((particle) => {
      particle.update(
        this.mouseX,
        this.mouseY,
        this.opacityStep,
        this.radius,
        this.intensity,
      );
      particle.draw(this.ctx);
    });
  }

  /** 画一帧并请求下一帧；静态模式只画这一帧 */
  drawCanvas() {
    this.renderFrame();
    if (!this.animate) return;
    this.animationFrameId = window.requestAnimationFrame(this.drawCanvasBound);
  }

  /** 销毁：停止动画并解绑事件 */
  destroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.canvasEle.removeEventListener('mousemove', this.handleMouseMove);
    this.canvasEle.removeEventListener('mouseleave', this.handleMouseLeave);
  }
}

export const ArkParticleAnimation = ({
  images,
  width = 480,
  height = 480,
  intervalMs = 5000,
}: ArkParticleAnimationProps) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const particleCanvasRef = React.useRef<ParticleCanvas | null>(null);
  /** 当前展示的 logo 下标，-1 表示尚未激活；画布是命令式的，不需要触发重渲染 */
  const activeIndexRef = React.useRef(-1);
  /** 当前这批 logo；像素解析是异步的，就绪与否用 `readyTick` 触发重新求值 */
  const logoImgsRef = React.useRef<LogoImg[]>([]);
  const [readyTick, setReadyTick] = React.useState(0);

  // images 用内容键参与依赖，调用方传内联数组时不会重建粒子
  const imagesKey = images
    .map((item) => `${item.name}\u0000${item.url}`)
    .join('\u0001');

  /* 初始化 ParticleCanvas 并启动动画 */
  React.useEffect(() => {
    if (!canvasRef.current) return;
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const pc = new ParticleCanvas(
      canvasRef.current,
      width,
      height,
      !reducedMotion,
    );
    particleCanvasRef.current = pc;
    pc.drawCanvas();
    return () => {
      pc.destroy();
      particleCanvasRef.current = null;
    };
  }, [width, height]);

  /* 实例化 LogoImg 列表（依赖图片内容与画布尺寸） */
  React.useEffect(() => {
    const imgs = images.map(
      (item) => new LogoImg(item.url, item.name, width, height),
    );
    logoImgsRef.current = imgs;
    activeIndexRef.current = -1;
    imgs.forEach((img) => {
      // 就绪与否直接读当前这批对象（`LogoImg.ready`），计数只用来触发重新求值：
      // StrictMode 会重跑一次这个 effect，上一批的回调后到时不会把计数算错。
      img.onload = () => setReadyTick((tick) => tick + 1);
    });
    // images 已由 imagesKey 投影，直接进依赖会因引用变化重建粒子
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 见上
  }, [imagesKey, width, height]);

  /* 全部 logo 就绪后激活第一张，随后按 intervalMs 轮播 */
  React.useEffect(() => {
    const logoImgs = logoImgsRef.current;
    if (logoImgs.length === 0) return;
    if (!logoImgs.every((img) => img.ready)) return;

    const activate = (idx: number) => {
      const logo = logoImgs[idx];
      if (!particleCanvasRef.current || !logo?.ready) return;
      particleCanvasRef.current.changeImg(logo);
      activeIndexRef.current = idx;
    };

    // 一批图片只激活一次；后续因就绪计数变化重跑时只重建定时器
    if (activeIndexRef.current === -1) activate(0);

    if (logoImgs.length < 2) return;
    // 减少动效时停在第一张，不自动轮播
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = window.setInterval(() => {
      activate(nextCarouselIndex(activeIndexRef.current, logoImgs.length));
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [readyTick, imagesKey, intervalMs]);

  return (
    <canvas ref={canvasRef} width={width} height={height} aria-hidden="true" />
  );
};

export default ArkParticleAnimation;
