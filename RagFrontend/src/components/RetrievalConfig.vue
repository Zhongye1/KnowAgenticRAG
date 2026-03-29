<template>
  <!-- 检索策略配置器 -->
  <div class="retrieval-config">
    <button class="config-trigger" :title="currentStrategy.name" @click="show = !show">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="config-icon"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"
        />
      </svg>
      <span>{{ currentStrategy.name }}</span>
      <svg
        :class="['arrow', { rotated: show }]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path stroke-linecap="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <Teleport to="body">
      <div v-if="show" class="strategy-overlay" @click.self="applyAndClose">
        <div class="strategy-panel">
          <div class="strategy-panel__header">
            <span>检索策略配置</span>
            <button class="close-btn" @click="applyAndClose">✕</button>
          </div>

          <!-- 策略选择 -->
          <div class="strategy-list">
            <div
              v-for="s in strategies"
              :key="s.id"
              :class="['strategy-item', { 'strategy-item--active': localConfig.strategy === s.id }]"
              @click="localConfig.strategy = s.id"
            >
              <div class="strategy-item__icon">{{ s.icon }}</div>
              <div class="strategy-item__info">
                <div class="strategy-item__name">{{ s.name }}</div>
                <div class="strategy-item__desc">{{ s.desc }}</div>
              </div>
              <span v-if="localConfig.strategy === s.id" class="check-mark">✓</span>
            </div>
          </div>

          <!-- 参数调节 -->
          <div class="params-section">
            <div class="params-title">检索参数</div>
            <div class="param-row">
              <label>返回文档数（Top-K）</label>
              <div class="param-control">
                <input
                  v-model.number="localConfig.topK"
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  class="range-input"
                />
                <span class="param-value">{{ localConfig.topK }}</span>
              </div>
            </div>
            <div class="param-row">
              <label>相似度阈值</label>
              <div class="param-control">
                <input
                  v-model.number="localConfig.scoreThreshold"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  class="range-input"
                />
                <span class="param-value">{{ localConfig.scoreThreshold.toFixed(2) }}</span>
              </div>
            </div>

            <!-- 混合检索权重（仅 hybrid/rrf 时显示） -->
            <template v-if="['hybrid', 'rrf'].includes(localConfig.strategy)">
              <div class="param-row">
                <label>向量检索权重</label>
                <div class="param-control">
                  <input
                    v-model.number="localConfig.vectorWeight"
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    class="range-input"
                  />
                  <span class="param-value">{{ localConfig.vectorWeight.toFixed(1) }}</span>
                </div>
              </div>
              <div class="param-row">
                <label>关键词检索权重</label>
                <div class="param-control">
                  <input
                    v-model.number="localConfig.bm25Weight"
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    class="range-input"
                  />
                  <span class="param-value">{{ localConfig.bm25Weight.toFixed(1) }}</span>
                </div>
              </div>
            </template>

            <!-- Rerank（可选） -->
            <div class="param-row">
              <label>
                启用重排序（Rerank）
                <span class="param-badge">可选</span>
              </label>
              <t-switch v-model="localConfig.rerank" size="small" />
            </div>
            <div v-if="localConfig.rerank" class="param-row param-row--indent">
              <label>Rerank Top-N</label>
              <div class="param-control">
                <input
                  v-model.number="localConfig.rerankTopN"
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  class="range-input"
                />
                <span class="param-value">{{ localConfig.rerankTopN }}</span>
              </div>
            </div>
          </div>

          <!-- 策略预览 -->
          <div class="strategy-preview">
            <div class="preview-label">当前配置预览</div>
            <code class="preview-code">{{ previewText }}</code>
          </div>

          <div class="strategy-actions">
            <button class="btn-reset" @click="resetConfig">重置默认</button>
            <button class="btn-apply" @click="applyAndClose">应用</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue'

export interface RetrievalConfig {
  strategy: string
  topK: number
  scoreThreshold: number
  vectorWeight: number
  bm25Weight: number
  rerank: boolean
  rerankTopN: number
}

const props = defineProps<{
  modelValue: RetrievalConfig
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', val: RetrievalConfig): void
  (e: 'change', val: RetrievalConfig): void
}>()

const show = ref(false)
const localConfig = reactive<RetrievalConfig>({ ...props.modelValue })

watch(
  () => props.modelValue,
  v => Object.assign(localConfig, v),
  { deep: true }
)

const strategies = [
  { id: 'vector', icon: '🧮', name: '纯向量检索', desc: '基于语义相似度，适合语义相关问题' },
  { id: 'bm25', icon: '🔤', name: '关键词检索（BM25）', desc: '基于词频匹配，适合精确词汇查找' },
  { id: 'hybrid', icon: '⚡', name: '混合检索', desc: '向量 + 关键词加权融合，综合效果最佳' },
  {
    id: 'rrf',
    icon: '🏆',
    name: 'RRF 融合排序（推荐）',
    desc: '互惠排名融合，无需手动调权重，稳定性强'
  },
  { id: 'mmr', icon: '🎯', name: 'MMR 多样性检索', desc: '最大边际相关，减少结果冗余，提升多样性' }
]

const currentStrategy = computed(
  () => strategies.find(s => s.id === localConfig.strategy) || strategies[3]
)

const previewText = computed(() => {
  const c = localConfig
  const parts = [`strategy=${c.strategy}`, `top_k=${c.topK}`, `threshold=${c.scoreThreshold}`]
  if (['hybrid', 'rrf'].includes(c.strategy)) {
    parts.push(`v_w=${c.vectorWeight}`, `bm25_w=${c.bm25Weight}`)
  }
  if (c.rerank) parts.push(`rerank=true`, `rerank_n=${c.rerankTopN}`)
  return parts.join('  |  ')
})

const DEFAULT_CONFIG: RetrievalConfig = {
  strategy: 'rrf',
  topK: 6,
  scoreThreshold: 0.3,
  vectorWeight: 0.6,
  bm25Weight: 0.4,
  rerank: false,
  rerankTopN: 3
}

function resetConfig() {
  Object.assign(localConfig, DEFAULT_CONFIG)
}

function applyAndClose() {
  const cfg = { ...localConfig }
  emit('update:modelValue', cfg)
  emit('change', cfg)
  show.value = false
}
</script>

<style scoped>
.retrieval-config {
  position: relative;
  display: inline-flex;
}

.config-trigger {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  cursor: pointer;
  font-size: 12.5px;
  color: #374151;
  transition: all 0.2s;
}
.config-trigger:hover {
  background: #f3f4f6;
}
.config-icon {
  width: 14px;
  height: 14px;
}
.arrow {
  width: 12px;
  height: 12px;
  transition: transform 0.2s;
}
.arrow.rotated {
  transform: rotate(180deg);
}

.strategy-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: rgba(0, 0, 0, 0.12);
}
.strategy-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 420px;
  max-height: 85vh;
  overflow-y: auto;
  background: white;
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  scrollbar-width: thin;
}
.strategy-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px 10px;
  border-bottom: 1px solid #f0f0f0;
  font-weight: 600;
  font-size: 14px;
  color: #111827;
  position: sticky;
  top: 0;
  background: white;
}
.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  padding: 2px 6px;
  border-radius: 4px;
}

/* 策略列表 */
.strategy-list {
  padding: 10px 12px 4px;
}
.strategy-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  margin-bottom: 3px;
}
.strategy-item:hover {
  background: #f9fafb;
}
.strategy-item--active {
  background: #eff6ff;
}
.strategy-item__icon {
  font-size: 18px;
  flex-shrink: 0;
}
.strategy-item__info {
  flex: 1;
  min-width: 0;
}
.strategy-item__name {
  font-size: 13px;
  font-weight: 500;
  color: #111827;
}
.strategy-item__desc {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 1px;
}
.check-mark {
  color: #4f7ef8;
  font-weight: 700;
}

/* 参数 */
.params-section {
  padding: 10px 16px;
  border-top: 1px solid #f5f5f5;
}
.params-title {
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
}
.param-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  gap: 12px;
}
.param-row--indent {
  padding-left: 12px;
}
.param-row label {
  font-size: 12.5px;
  color: #374151;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.param-control {
  display: flex;
  align-items: center;
  gap: 8px;
}
.range-input {
  width: 100px;
  accent-color: #4f7ef8;
}
.param-value {
  font-size: 12px;
  font-weight: 600;
  color: #4f7ef8;
  min-width: 28px;
  text-align: right;
}
.param-badge {
  font-size: 10px;
  background: #f3f4f6;
  color: #6b7280;
  padding: 1px 5px;
  border-radius: 4px;
}

/* 预览 */
.strategy-preview {
  margin: 10px 12px;
  background: #f9fafb;
  border-radius: 8px;
  padding: 10px 12px;
}
.preview-label {
  font-size: 11px;
  color: #9ca3af;
  margin-bottom: 5px;
}
.preview-code {
  font-size: 11px;
  font-family: monospace;
  color: #374151;
  word-break: break-all;
}

/* 底部按钮 */
.strategy-actions {
  display: flex;
  gap: 8px;
  padding: 10px 14px 14px;
  justify-content: flex-end;
}
.btn-reset {
  padding: 7px 14px;
  border: 1px solid #d1d5db;
  border-radius: 7px;
  background: white;
  cursor: pointer;
  font-size: 13px;
  color: #6b7280;
}
.btn-apply {
  padding: 7px 18px;
  border: none;
  border-radius: 7px;
  background: #4f7ef8;
  color: white;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}
.btn-apply:hover {
  background: #3b6fd4;
}
</style>
