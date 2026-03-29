<template>
  <div class="graph-container flex flex-col gap-3">
    <!-- 顶部工具栏 -->
    <div class="toolbar flex flex-wrap items-center gap-2">
      <!-- 生成 / 加载合并图 -->
      <button
        class="bg-blue-500 hover:bg-blue-600 text-white py-1.5 px-4 rounded text-sm transition"
        :disabled="isLoading"
        @click="fetchMergedGraph"
      >
        <span v-if="isLoading && loadingType === 'merged'" class="flex items-center gap-1">
          <svg
            class="animate-spin h-3.5 w-3.5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            /></svg
          >生成中…
        </span>
        <span v-else>🔄 加载全图</span>
      </button>

      <!-- 生成图谱（原有逻辑，保留） -->
      <button
        class="bg-green-500 hover:bg-green-600 text-white py-1.5 px-4 rounded text-sm transition"
        :disabled="isLoading"
        @click="fetchGraphData"
      >
        <span v-if="isLoading && loadingType === 'generate'">生成中…</span>
        <span v-else>✨ 生成图谱</span>
      </button>

      <!-- 节点搜索 -->
      <div class="flex items-center gap-1">
        <input
          v-model="searchKeyword"
          placeholder="搜索节点…"
          class="border border-gray-300 rounded px-2 py-1 text-sm w-36 focus:outline-none focus:ring-1 focus:ring-blue-400"
          @keyup.enter="searchNodes"
        />
        <button
          class="bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded px-2 py-1 text-sm transition"
          :disabled="isLoading || !searchKeyword.trim()"
          @click="searchNodes"
        >
          🔍
        </button>
        <button
          v-if="isSearchMode"
          class="text-gray-500 hover:text-red-500 text-sm px-1"
          title="清除搜索"
          @click="clearSearch"
        >
          ✕
        </button>
      </div>

      <!-- 统计信息按钮 -->
      <button
        class="bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 py-1.5 px-3 rounded text-sm transition"
        @click="toggleStats"
      >
        📊 统计
      </button>

      <!-- 图谱统计浮窗 -->
      <div
        v-if="showStats && graphStats"
        class="absolute top-16 right-4 z-30 bg-white shadow-lg rounded-lg border p-3 text-sm w-56"
      >
        <div class="flex justify-between items-center mb-2">
          <span class="font-semibold text-gray-700">图谱统计</span>
          <button class="text-gray-400 hover:text-gray-600" @click="showStats = false">✕</button>
        </div>
        <div class="space-y-1 text-gray-600">
          <div>
            节点总数：<span class="font-medium text-blue-600">{{ graphStats.node_count }}</span>
          </div>
          <div>
            边总数：<span class="font-medium text-green-600">{{ graphStats.edge_count }}</span>
          </div>
          <div>
            孤立节点：<span class="font-medium text-orange-500">{{
              graphStats.isolated_node_count
            }}</span>
          </div>
          <div v-if="graphStats.type_distribution" class="mt-2">
            <div class="text-xs text-gray-500 mb-1">节点类型分布：</div>
            <div
              v-for="(count, type) in graphStats.type_distribution"
              :key="type"
              class="flex justify-between text-xs"
            >
              <span>{{ type }}</span
              ><span class="font-medium">{{ count }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 错误提示 -->
    <div
      v-if="errorMessage"
      class="text-red-500 text-sm p-2 bg-red-50 border border-red-200 rounded"
    >
      {{ errorMessage }}
    </div>

    <!-- 搜索结果提示 -->
    <div v-if="isSearchMode" class="text-blue-600 text-xs bg-blue-50 px-2 py-1 rounded">
      搜索「{{ lastKeyword }}」，找到 {{ searchMatchCount }} 个匹配节点及其邻居
    </div>

    <!-- 图谱渲染区 -->
    <div class="relative">
      <div id="sigma-container"></div>

      <!-- 节点详情侧边板 -->
      <transition name="slide">
        <div
          v-if="selectedNode"
          class="absolute top-2 right-2 z-20 bg-white shadow-lg rounded-lg border p-4 w-56 text-sm"
        >
          <div class="flex justify-between items-center mb-2">
            <span class="font-semibold text-gray-700">节点详情</span>
            <button class="text-gray-400 hover:text-gray-600" @click="selectedNode = null">
              ✕
            </button>
          </div>
          <div class="space-y-1 text-gray-600">
            <div><span class="text-gray-400">ID：</span>{{ selectedNode.id }}</div>
            <div>
              <span class="text-gray-400">名称：</span>
              <span class="font-medium text-gray-800">{{ selectedNode.label }}</span>
            </div>
            <div v-if="selectedNode.type">
              <span class="text-gray-400">类型：</span>
              <span
                class="px-1.5 py-0.5 rounded text-xs text-white"
                :style="{ backgroundColor: getNodeColor(selectedNode.type) }"
              >
                {{ selectedNode.type }}
              </span>
            </div>
            <div class="mt-2 pt-2 border-t text-xs text-gray-500">
              <div>出度：{{ getNodeDegree(selectedNode.id, 'out') }}</div>
              <div>入度：{{ getNodeDegree(selectedNode.id, 'in') }}</div>
            </div>
            <!-- 相邻关系列表 -->
            <div class="mt-2 pt-2 border-t text-xs">
              <div class="text-gray-400 mb-1">相关关系：</div>
              <div
                v-for="rel in getNodeRelations(selectedNode.id)"
                :key="rel.key"
                class="mb-0.5 text-gray-600"
              >
                <span v-if="rel.direction === 'out'" class="text-blue-500">→ {{ rel.target }}</span>
                <span v-else class="text-green-500">← {{ rel.source }}</span>
                <span class="text-gray-400 ml-1">({{ rel.label }})</span>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import chroma from 'chroma-js'

import GraphLib from 'graphology'
import ForceSupervisor from 'graphology-layout-force/worker'
import Sigma from 'sigma'
import { v4 as uuid } from 'uuid'
import API_ENDPOINTS from '@/utils/apiConfig'

// 使用 any 绕过 graphology 严格泛型（运行时完全正常）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGraph = any

const route = useRoute()

const props = defineProps({
  kbId: { type: String, default: '' }
})

// ── 类型定义
interface GraphNode {
  id: string
  label?: string
  type?: string
  x?: number
  y?: number
  size?: number
  color?: string
}
interface GraphEdge {
  source: string
  target: string
  label?: string
}
interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
interface GraphStats {
  node_count: number
  edge_count: number
  isolated_node_count: number
  type_distribution?: Record<string, number>
}

// ── 状态
let renderer: Sigma | null = null
let layout: ForceSupervisor | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let graph: AnyGraph = new (GraphLib as any)({ multi: true })
let currentEdges: GraphEdge[] = []

const isLoading = ref(false)
const loadingType = ref<'generate' | 'merged' | 'search' | ''>('')
const errorMessage = ref('')
const searchKeyword = ref('')
const lastKeyword = ref('')
const isSearchMode = ref(false)
const searchMatchCount = ref(0)
const selectedNode = ref<GraphNode | null>(null)
const showStats = ref(false)
const graphStats = ref<GraphStats | null>(null)

// 节点颜色映射
const NODE_COLORS: Record<string, string> = {
  人物: '#FF6B6B',
  地点: '#4ECDC4',
  组织: '#45B7D1',
  概念: '#FFD166',
  事件: '#06D6A0',
  默认: '#90D8FF'
}

const getNodeColor = (type: string) => NODE_COLORS[type] || NODE_COLORS['默认']

// ── 获取节点度数
const getNodeDegree = (nodeId: string, direction: 'in' | 'out') => {
  return currentEdges.filter(e => (direction === 'out' ? e.source === nodeId : e.target === nodeId))
    .length
}

// ── 获取节点关系列表（最多显示 5 条）
const getNodeRelations = (nodeId: string) => {
  const rels: Array<{
    key: string
    direction: string
    source: string
    target: string
    label: string
  }> = []
  for (const e of currentEdges) {
    if (e.source === nodeId) {
      rels.push({
        key: `out-${e.source}-${e.target}`,
        direction: 'out',
        source: e.source,
        target: e.target,
        label: e.label || ''
      })
    } else if (e.target === nodeId) {
      rels.push({
        key: `in-${e.source}-${e.target}`,
        direction: 'in',
        source: e.source,
        target: e.target,
        label: e.label || ''
      })
    }
    if (rels.length >= 6) break
  }
  return rels
}

// ── 统计面板开关 + 加载统计数据
const toggleStats = async () => {
  showStats.value = !showStats.value
  if (showStats.value && !graphStats.value) {
    await loadStats()
  }
}

const loadStats = async () => {
  const kbId = props.kbId || String(route.params.id || '')
  if (!kbId) return
  try {
    const res = await fetch(API_ENDPOINTS.KNOWLEDGE_GRAPH.GRAPH_STATS(kbId))
    if (res.ok) graphStats.value = await res.json()
  } catch (e) {
    console.warn('统计加载失败', e)
  }
}

// ── 生成图谱（原有逻辑）
const fetchGraphData = async () => {
  const kbId = props.kbId || String(route.params.id || '')
  if (!kbId) {
    errorMessage.value = '未提供知识库 ID'
    return
  }
  isLoading.value = true
  loadingType.value = 'generate'
  errorMessage.value = ''
  try {
    const res = await fetch(API_ENDPOINTS.KNOWLEDGE_GRAPH.PROCESS_KNOWLEDGE_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_path: kbId })
    })
    if (!res.ok) throw new Error(`API 请求失败：${res.statusText}`)
    const data = await res.json()
    if (data && data.length > 0 && data[0].graph_data) {
      updateGraph(data[0].graph_data)
      graphStats.value = null // 重置统计
    } else {
      errorMessage.value = '返回的数据格式不正确 / 知识库为空'
    }
  } catch (err) {
    errorMessage.value = `生成图谱出错: ${err instanceof Error ? err.message : String(err)}`
  } finally {
    isLoading.value = false
    loadingType.value = ''
  }
}

// ── 加载全合并图
const fetchMergedGraph = async () => {
  const kbId = props.kbId || String(route.params.id || '')
  if (!kbId) {
    errorMessage.value = '未提供知识库 ID'
    return
  }
  isLoading.value = true
  loadingType.value = 'merged'
  errorMessage.value = ''
  isSearchMode.value = false
  try {
    const res = await fetch(API_ENDPOINTS.KNOWLEDGE_GRAPH.GET_MERGED_GRAPH(kbId))
    if (!res.ok) throw new Error(`API 请求失败：${res.statusText}`)
    const data: GraphData & { message?: string } = await res.json()
    if (data.message && !data.nodes?.length) {
      errorMessage.value = data.message
    } else {
      updateGraph(data)
      graphStats.value = null
    }
  } catch (err) {
    errorMessage.value = `加载全图出错: ${err instanceof Error ? err.message : String(err)}`
  } finally {
    isLoading.value = false
    loadingType.value = ''
  }
}

// ── 节点搜索
const searchNodes = async () => {
  const kw = searchKeyword.value.trim()
  if (!kw) return
  const kbId = props.kbId || String(route.params.id || '')
  if (!kbId) return
  isLoading.value = true
  loadingType.value = 'search'
  errorMessage.value = ''
  try {
    const res = await fetch(API_ENDPOINTS.KNOWLEDGE_GRAPH.SEARCH_NODES(kbId, kw))
    if (!res.ok) throw new Error(`搜索请求失败：${res.statusText}`)
    const data: GraphData & { matched_count?: number; message?: string } = await res.json()
    if (data.message) {
      errorMessage.value = data.message
      return
    }
    isSearchMode.value = true
    lastKeyword.value = kw
    searchMatchCount.value = data.matched_count || 0
    updateGraph(data)
  } catch (err) {
    errorMessage.value = `搜索出错: ${err instanceof Error ? err.message : String(err)}`
  } finally {
    isLoading.value = false
    loadingType.value = ''
  }
}

const clearSearch = () => {
  searchKeyword.value = ''
  isSearchMode.value = false
  fetchMergedGraph()
}

// ── 更新图谱渲染
const updateGraph = (graphData: GraphData) => {
  if (!graphData?.nodes) return
  currentEdges = graphData.edges || []
  selectedNode.value = null
  graph.clear()

  graphData.nodes.forEach((node, index) => {
    const angle = (index / graphData.nodes.length) * 2 * Math.PI
    const r = 10 + Math.random() * 5
    const nodeType = node.type || '默认'
    graph.addNode(node.id, {
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      size: 18,
      color: getNodeColor(nodeType),
      label: node.label || node.id,
      type: nodeType
    })
  })

  graphData.edges.forEach((edge, index) => {
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
      try {
        graph.addEdge(edge.source, edge.target, {
          label: edge.label || '',
          size: 1.5,
          forceLabel: true,
          color: '#aaa'
        })
      } catch (_) {
        /* 忽略重复边异常 */
      }
    }
  })

  // 重启力导向布局
  if (layout) {
    layout.kill()
    layout = null
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layout = new ForceSupervisor(graph, { isNodeFixed: (_: string, attr: any) => attr.highlighted })
  layout.start()

  // 重新创建渲染器
  if (renderer) {
    renderer.kill()
    renderer = null
  }
  const container = document.getElementById('sigma-container')
  if (container) {
    renderer = new Sigma(graph, container, {
      minCameraRatio: 0.1,
      maxCameraRatio: 5,
      renderEdgeLabels: true,
      edgeLabelSize: 11,
      edgeLabelWeight: 'bold',
      labelRenderedSizeThreshold: 5
    } as any)
    bindEvents()
  }
}

// ── 事件绑定
let draggedNode: string | null = null
let isDragging = false

const bindEvents = () => {
  if (!renderer) return

  // 节点点击 → 显示详情
  renderer.on('clickNode', ({ node }) => {
    const attrs = graph.getNodeAttributes(node)
    selectedNode.value = { id: node, label: attrs.label, type: attrs.type }
    // 高亮选中节点
    graph.setNodeAttribute(node, 'highlighted', true)
    graph.setNodeAttribute(node, 'size', 28)
  })

  // 点击空白 → 取消选中
  renderer.on('clickStage', () => {
    // 取消高亮
    if (selectedNode.value) {
      try {
        graph.setNodeAttribute(selectedNode.value.id, 'highlighted', false)
        graph.setNodeAttribute(selectedNode.value.id, 'size', 18)
      } catch (_) {}
    }
    selectedNode.value = null

    // 双击添加节点（保留原有功能）
  })

  // 拖拽
  renderer.on('downNode', e => {
    isDragging = true
    draggedNode = e.node
    graph.setNodeAttribute(draggedNode, 'highlighted', true)
    if (renderer && !renderer.getCustomBBox()) renderer.setCustomBBox(renderer.getBBox())
  })

  renderer.on('moveBody', ({ event }) => {
    if (!isDragging || !draggedNode || !renderer) return
    const pos = renderer.viewportToGraph(event)
    graph.setNodeAttribute(draggedNode, 'x', pos.x)
    graph.setNodeAttribute(draggedNode, 'y', pos.y)
    event.preventSigmaDefault()
    event.original.preventDefault()
    event.original.stopPropagation()
  })

  const handleUp = () => {
    if (draggedNode && !selectedNode.value) {
      graph.removeNodeAttribute(draggedNode, 'highlighted')
    }
    isDragging = false
    draggedNode = null
  }

  renderer.on('upNode', handleUp)
  renderer.on('upStage', handleUp)

  // 节点悬停
  renderer.on('enterNode', ({ node }) => {
    if (renderer) renderer.getCamera().animatedUnzoom({ duration: 0 })
    graph.setNodeAttribute(node, 'highlighted', true)
  })

  renderer.on('leaveNode', ({ node }) => {
    if (!selectedNode.value || selectedNode.value.id !== node) {
      graph.setNodeAttribute(node, 'highlighted', false)
    }
  })
}

// ── 生命周期
onMounted(() => {
  const container = document.getElementById('sigma-container')
  if (!container) return

  graph.addNode('hint', {
    x: 0,
    y: 0,
    size: 12,
    color: '#4B96FF',
    label: '点击「加载全图」或「生成图谱」'
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layout = new ForceSupervisor(graph, { isNodeFixed: (_: string, attr: any) => attr.highlighted })
  layout.start()

  renderer = new Sigma(graph, container, {
    minCameraRatio: 0.1,
    maxCameraRatio: 5,
    renderEdgeLabels: true,
    edgeLabelSize: 11
  } as any)

  bindEvents()
})

onBeforeUnmount(() => {
  layout?.kill()
  renderer?.kill()
})
</script>

<style scoped>
.graph-container {
  position: relative;
  width: 100%;
}

#sigma-container {
  width: 100%;
  height: 620px;
  background: #fafafa;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
}

#sigma-container :deep(canvas) {
  position: absolute !important;
  top: 0;
  left: 0;
}

.slide-enter-active,
.slide-leave-active {
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(20px);
  opacity: 0;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
