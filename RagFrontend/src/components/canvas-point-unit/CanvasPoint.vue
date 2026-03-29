<template>
  <div class="canvas-container" :style="{ transform: `scale(${scaleVal})` }">
    <!-- 使用 ref 获取 canvas 元素的直接引用 -->
    <canvas ref="canvasRef"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { CanvasProps } from './CanvasPoint'

class Particle {
  x: number
  y: number
  originX: number // 粒子的原始x坐标
  originY: number // 粒子的原始y坐标
  radius: number
  color: string
  vx: number // x轴速度
  vy: number // y轴速度
  ease: number = 0.05 // 缓动系数，控制返回速度
  friction: number = 0.95 // 摩擦力，让移动逐渐减慢

  constructor(x: number, y: number, color: string = '#2EA9DF', radius: number = 1) {
    this.x = x + (Math.random() - 0.5) * 50 // 初始位置增加随机偏移
    this.y = y + (Math.random() - 0.5) * 50
    this.originX = x
    this.originY = y
    this.color = color
    this.radius = radius
    this.vx = 0
    this.vy = 0
  }

  // 绘制粒子
  draw(ctx: CanvasRenderingContext2D) {
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI, false)
    ctx.fillStyle = this.color
    ctx.fill()
    ctx.closePath()
  }

  // 更新粒子的位置，实现动画
  update() {
    // 计算从当前位置到原始位置的距离
    const dx = this.originX - this.x
    const dy = this.originY - this.y

    // 使用缓动算法让粒子平滑地移回原始位置
    this.vx = dx * this.ease + this.vx * this.friction
    this.vy = dy * this.ease + this.vy * this.friction

    this.x += this.vx
    this.y += this.vy
  }
}

// --- Vue 组件逻辑 ---
const canvasRef = ref<HTMLCanvasElement | null>(null)
const props = withDefaults(defineProps<CanvasProps>(), {
  text: 'Hello',
  width: window.innerWidth,
  height: window.innerHeight,
  scaleVal: 0.5,
  color: '#2752d9'
})
const scaleVal = ref(props.scaleVal)

let particles: Particle[] = [] // 用于存储所有粒子
let animationFrameId: number // 存储 requestAnimationFrame 的 ID

// 初始化函数：负责计算并创建所有粒子
const init = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) // willReadFrequently 优化 getImageData
  if (!ctx) return

  // 设置画布尺寸
  const WIDTH = props.width
  const HEIGHT = props.height
  canvas.width = WIDTH
  canvas.height = HEIGHT

  // 使用离屏 Canvas 获取文字的像素数据
  const offscreenCanvas = document.createElement('canvas')
  const offscreenCtx = offscreenCanvas.getContext('2d')
  if (!offscreenCtx) return

  offscreenCanvas.width = WIDTH
  offscreenCanvas.height = HEIGHT

  offscreenCtx.font = 'bold 100px sans-serif'
  offscreenCtx.textAlign = 'center'
  offscreenCtx.textBaseline = 'middle'
  offscreenCtx.fillText(props.text, WIDTH / 2, HEIGHT / 2)

  const imgData = offscreenCtx.getImageData(0, 0, WIDTH, HEIGHT).data
  particles = [] // 清空现有粒子
  const skip = 4 // 采样间隔，值越大粒子越稀疏，性能越好

  for (let y = 0; y < HEIGHT; y += skip) {
    for (let x = 0; x < WIDTH; x += skip) {
      const opacityIndex = (x + y * WIDTH) * 4 + 3
      if (imgData[opacityIndex] > 0) {
        // 如果像素不透明
        particles.push(
          new Particle(x + Math.random() * 6 - 3, y + Math.random() * 6 - 3, props.color, 2)
        )
        // 创建粒子并且完成随机活动
      }
    }
  }
}

// 动画循环函数
const animate = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 关键：在每一帧开始时清空画布，为重绘做准备
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // 更新并绘制每一个粒子
  for (const particle of particles) {
    particle.update()
    particle.draw(ctx)
  }

  animationFrameId = requestAnimationFrame(animate)
}

// 窗口大小变化时的处理器
const handleResize = () => {
  // 重新初始化所有粒子
  init()
}

onMounted(() => {
  init() // 组件挂载后，初始化粒子
  animate() // 开始动画循环
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  cancelAnimationFrame(animationFrameId) // 组件卸载时，取消动画循环，防止内存泄漏
})
</script>
