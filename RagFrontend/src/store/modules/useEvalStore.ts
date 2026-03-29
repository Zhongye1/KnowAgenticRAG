// src/store/modules/useEvalStore.ts
// 评测任务全局状态 - 切换路由不丢失进度
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

export const useEvalStore = defineStore('eval', () => {
  const running = ref(false)
  const progress = ref('') // 当前进度描述
  const models = ref('') // 正在评测的模型名
  const startedAt = ref<number>(0)

  // 最近一次结果
  const latestRun = ref<any>(null)
  const historyList = ref<any[]>([])
  const chartData = ref<any>(null)

  const isRunning = computed(() => running.value)

  /** 启动评测（如果已在运行则忽略） */
  async function startEval(modelNames: string[]) {
    if (running.value) return
    running.value = true
    models.value = modelNames.join(', ')
    progress.value = '正在发送评测请求...'
    startedAt.value = Date.now()

    try {
      await axios.post('/api/eval/run', { model_names: modelNames })
      progress.value = `评测进行中（${models.value}）...`

      // 等待5秒后开始轮询
      await delay(5000)
      let tries = 0
      while (tries++ < 30) {
        const ok = await pollResult()
        if (ok) break
        await delay(3000)
      }
    } catch (e: any) {
      progress.value = `评测出错：${e?.message || String(e)}`
    } finally {
      running.value = false
      progress.value = ''
    }
  }

  /** 拉取最新结果 */
  async function fetchLatest() {
    try {
      const [latestRes, historyRes] = await Promise.all([
        axios.get('/api/eval/latest'),
        axios.get('/api/eval/results?limit=10')
      ])
      chartData.value = latestRes.data
      latestRun.value = latestRes.data?.latest_run || null
      historyList.value = historyRes.data?.results || []
    } catch {}
  }

  /** 轮询结果，完成时返回 true */
  async function pollResult(): Promise<boolean> {
    await fetchLatest()
    const done = historyList.value[0]?.status === 'done'
    if (done) progress.value = '评测完成！'
    return done
  }

  function delay(ms: number) {
    return new Promise<void>(r => setTimeout(r, ms))
  }

  return {
    running,
    progress,
    models,
    startedAt,
    latestRun,
    historyList,
    chartData,
    isRunning,
    startEval,
    fetchLatest
  }
})
