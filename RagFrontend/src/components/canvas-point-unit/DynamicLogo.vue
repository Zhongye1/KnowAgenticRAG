<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'

// 接收父组件传入的图片源
const props = defineProps<{
  logoSrc: string
}>()

// 获取canvas画布
const canvas = ref<HTMLCanvasElement | null>(null)

// 画布尺寸
const width = 400,
  height = 400

// 粒子动画配置
const animateTime = 30
const opacityStep = 1 / animateTime
const Radius = 120
const Inten = 2.8

/** 粒子类 */
class Particle {
  x: number // 当前X位置
  y: number // 当前Y位置
  totalX: number // 目标X位置
  totalY: number // 目标Y位置
  mx?: number // X方向移动距离
  my?: number // Y方向移动距离
  vx?: number // X方向速度
  vy?: number // Y方向速度
  time: number // 动画时长
  r: number // 粒子半径
  color: number[] // 粒子颜色
  opacity: number // 透明度

  constructor(totalX: number, totalY: number, time: number, color: number[]) {
    // 初始位置随机
    this.x = (Math.random() * width) >> 0
    this.y = (Math.random() * height) >> 0
    this.totalX = totalX
    this.totalY = totalY
    this.time = time
    this.r = 1.2
    this.color = [...color]
    this.opacity = 0
  }

  // 绘制粒子
  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = `rgba(${this.color[0]}, ${this.color[1]}, ${this.color[2]}, ${this.opacity})`
    ctx.fillRect(this.x, this.y, this.r * 2, this.r * 2)
  }

  // 更新粒子位置
  update(mouseX?: number, mouseY?: number) {
    this.mx = this.totalX - this.x
    this.my = this.totalY - this.y
    this.vx = this.mx / this.time
    this.vy = this.my / this.time

    // 鼠标交互效果
    if (mouseX && mouseY) {
      const dx = mouseX - this.x
      const dy = mouseY - this.y
      const distance = Math.sqrt(dx ** 2 + dy ** 2)

      // 修改作用范围判断和衰减逻辑
      if (distance < Radius && distance > 0) {
        // 添加距离衰减因子 (1 - distance/Radius)，使效果随距离自然递减
        const distanceFactor = 1 - distance / Radius
        const angle = Math.atan2(dy, dx)
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        // 结合基础强度和距离衰减因子
        const repX = cos * distanceFactor * -Inten
        const repY = sin * distanceFactor * -Inten
        this.vx += repX
        this.vy += repY
      }
    }

    this.x += this.vx
    this.y += this.vy
    if (this.opacity < 1) this.opacity += opacityStep
  }

  // 改变粒子目标位置和颜色
  change(x: number, y: number, color: number[]) {
    this.totalX = x
    this.totalY = y
    this.color = [...color]
  }
}

/** Logo图片解析类 */
class LogoImg {
  src: string
  particleData: Particle[]
  loaded: boolean

  constructor(src: string) {
    this.src = src
    this.particleData = []
    this.loaded = false
    this.loadImage()
  }

  // 加载图片
  loadImage() {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = this.src
    img.onload = () => this.processImage(img)
    img.onerror = () => console.error(`图片加载失败: ${this.src}`)
  }

  // 处理图片生成粒子数据
  processImage(img: HTMLImageElement) {
    const tmpCanvas = document.createElement('canvas')
    const tmpCtx = tmpCanvas.getContext('2d')
    if (!tmpCtx) return

    // 计算图片缩放尺寸
    const imgW = width
    const imgH = Math.floor(width * (img.height / img.width))
    tmpCanvas.width = imgW
    tmpCanvas.height = imgH
    tmpCtx.drawImage(img, 0, 0, imgW, imgH)

    // 获取像素数据
    const imgData = tmpCtx.getImageData(0, 0, imgW, imgH).data
    this.particleData = []

    // 每5像素取一个点生成粒子
    for (let y = 0; y < imgH; y += 5) {
      for (let x = 0; x < imgW; x += 5) {
        const index = (x + y * imgW) * 4
        const r = imgData[index]
        const g = imgData[index + 1]
        const b = imgData[index + 2]
        const a = imgData[index + 3]

        // 筛选非透明像素
        // 筛选非透明像素
        if (a > 100) {
          // 增加亮度调整系数 (1.0为原始亮度，值越大越亮)
          const brightnessFactor = 2.5
          const r = Math.min(imgData[index] * brightnessFactor, 255)
          const g = Math.min(imgData[index + 1] * brightnessFactor, 255)
          const b = Math.min(imgData[index + 2] * brightnessFactor, 255)
          this.particleData.push(new Particle(x, y, animateTime, [r, g, b, a]))
        }
      }
    }

    this.loaded = true
  }
}

/** 粒子画布类 */
class ParticleCanvas {
  canvasEle: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  ParticleArr: Particle[]
  mouseX?: number
  mouseY?: number
  animationId?: number

  constructor(target: HTMLCanvasElement) {
    this.canvasEle = target
    this.ctx = target.getContext('2d') as CanvasRenderingContext2D
    this.width = target.width
    this.height = target.height
    this.ParticleArr = []
    this.bindEvents()
  }

  // 绑定鼠标事件
  bindEvents() {
    this.canvasEle.addEventListener('mousemove', e => {
      const { left, top } = this.canvasEle.getBoundingClientRect()
      this.mouseX = e.clientX - left
      this.mouseY = e.clientY - top
    })

    this.canvasEle.addEventListener('mouseleave', () => {
      this.mouseX = undefined
      this.mouseY = undefined
    })
  }

  // 改变图片
  changeImg(img: LogoImg) {
    if (!img.loaded) return

    // 如果已有粒子，复用并修改属性
    if (this.ParticleArr.length) {
      const newPrtArr = img.particleData
      const newLen = newPrtArr.length
      const oldLen = this.ParticleArr.length

      // 更新或创建粒子
      for (let i = 0; i < newLen; i++) {
        const { totalX, totalY, color } = newPrtArr[i]
        if (this.ParticleArr[i]) {
          this.ParticleArr[i].change(totalX, totalY, color)
        } else {
          this.ParticleArr[i] = new Particle(totalX, totalY, animateTime, color)
        }
      }

      // 移除多余粒子
      if (newLen < oldLen) {
        this.ParticleArr = this.ParticleArr.slice(0, newLen)
      }

      // 随机打乱粒子位置，使动画更自然
      this.shuffleParticles()
    } else {
      // 首次加载粒子
      this.ParticleArr = img.particleData.map(
        item => new Particle(item.totalX, item.totalY, animateTime, item.color)
      )
    }
  }

  // 随机打乱粒子
  shuffleParticles() {
    let len = this.ParticleArr.length
    while (len > 0) {
      const randomIdx = Math.floor(Math.random() * len)
      len--
      const temp = this.ParticleArr[len]
      this.ParticleArr[len] = this.ParticleArr[randomIdx]
      this.ParticleArr[randomIdx] = temp
    }
  }

  // 绘制画布
  drawCanvas() {
    this.ctx.clearRect(0, 0, this.width, this.height)
    this.ParticleArr.forEach(particle => {
      particle.update(this.mouseX, this.mouseY)
      particle.draw(this.ctx)
    })
    this.animationId = requestAnimationFrame(() => this.drawCanvas())
  }

  // 销毁动画
  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
    }
  }
}

let particleCanvas: ParticleCanvas | null = null
let currentLogoImg: LogoImg | null = null

// 监听图片源变化
watch(
  () => props.logoSrc,
  newSrc => {
    {
      currentLogoImg = new LogoImg(newSrc)
      // 等待图片加载完成后更新粒子
      const checkLoaded = setInterval(() => {
        if (currentLogoImg?.loaded && particleCanvas) {
          particleCanvas.changeImg(currentLogoImg)
          clearInterval(checkLoaded)
        }
      }, 100)
    }
  },
  { immediate: true }
)

// 初始化画布
onMounted(() => {
  if (canvas.value) {
    particleCanvas = new ParticleCanvas(canvas.value)
    particleCanvas.drawCanvas()
  }
})

// 组件卸载时销毁动画
onUnmounted(() => {
  particleCanvas?.destroy()
})
</script>

<template>
  <canvas ref="canvas" :width="width" :height="height"></canvas>
</template>

<style scoped>
canvas {
  background-color: rgba(0, ０, 0, 0.1);
  border-radius: 8px;
}
</style>
