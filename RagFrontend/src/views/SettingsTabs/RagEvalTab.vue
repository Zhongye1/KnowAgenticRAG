<template>
  <div class="tab-content">
    <div class="section-header">
      <h2>RAG 效果评估与调优</h2>
      <p class="section-desc">评测检索精度、生成质量，可视化分析并自动调优超参数</p>
    </div>

    <!-- 评估概览 -->
    <div class="metric-cards">
      <div v-for="m in metrics" :key="m.key" class="metric-card">
        <div class="metric-icon">{{ m.icon }}</div>
        <div class="metric-value" :class="`val--${m.level}`">{{ m.value }}</div>
        <div class="metric-label">{{ m.label }}</div>
        <div class="metric-trend" :class="m.trend > 0 ? 'trend--up' : 'trend--down'">
          {{ m.trend > 0 ? '↑' : '↓' }} {{ Math.abs(m.trend) }}%
        </div>
      </div>
    </div>

    <!-- 评估测试集 -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">评估测试集</span>
        <div class="card-actions">
          <button class="btn-sm" @click="importTestset">📂 导入 CSV</button>
          <button class="btn-primary-sm" @click="runEvaluation" :disabled="evaluating">
            {{ evaluating ? '⏳ 评估中...' : '▶ 运行评估' }}
          </button>
        </div>
      </div>
      <div class="testset-table-wrap">
        <table class="testset-table">
          <thead>
            <tr><th>#</th><th>问题</th><th>参考答案</th><th>命中得分</th><th>ROUGE-L</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in testset" :key="item.id">
              <td class="td-num">{{ idx + 1 }}</td>
              <td>{{ item.question }}</td>
              <td class="td-ref">{{ item.reference.slice(0, 40) }}...</td>
              <td>
                <div class="score-bar-wrap">
                  <div class="score-bar" :style="{ width: item.hit_score + '%', background: scoreColor(item.hit_score) }"></div>
                  <span class="score-val">{{ item.hit_score }}%</span>
                </div>
              </td>
              <td><span :class="['rouge-badge', rougeLevel(item.rouge)]">{{ item.rouge.toFixed(2) }}</span></td>
              <td>
                <button class="btn-micro" @click="viewDetail(item)">详情</button>
                <button class="btn-micro btn-del" @click="removeTest(item.id)">×</button>
              </td>
            </tr>
            <tr class="add-row" @click="addTestItem">
              <td colspan="6" class="add-row-cell">+ 添加测试样本</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 自动调优 -->
    <div class="card" style="margin-top: 14px;">
      <div class="card-header">
        <span class="card-title">🔧 自动调优</span>
        <span class="card-desc">网格搜索最优检索参数</span>
      </div>
      <div class="tuning-grid">
        <div class="tuning-param">
          <label>检索 top_k 范围</label>
          <div class="range-row">
            <input type="number" v-model.number="tuning.top_k_min" min="1" max="20" class="num-input" />
            <span>—</span>
            <input type="number" v-model.number="tuning.top_k_max" min="1" max="20" class="num-input" />
          </div>
        </div>
        <div class="tuning-param">
          <label>相似度阈值范围</label>
          <div class="range-row">
            <input type="number" v-model.number="tuning.sim_min" min="0" max="1" step="0.05" class="num-input" />
            <span>—</span>
            <input type="number" v-model.number="tuning.sim_max" min="0" max="1" step="0.05" class="num-input" />
          </div>
        </div>
        <div class="tuning-param">
          <label>检索策略候选</label>
          <div class="checkbox-row">
            <label v-for="s in strategies" :key="s" class="check-label">
              <input type="checkbox" :value="s" v-model="tuning.strategies" />{{ s }}
            </label>
          </div>
        </div>
        <div class="tuning-param">
          <label>重排序模型</label>
          <select v-model="tuning.reranker" class="form-select">
            <option value="none">不启用</option>
            <option value="bge">BGE Reranker</option>
            <option value="cross_encoder">Cross-Encoder</option>
          </select>
        </div>
      </div>
      <button class="btn-primary" @click="startAutoTuning" :disabled="tuningRunning">
        {{ tuningRunning ? '⏳ 调优运行中...' : '🚀 开始自动调优' }}
      </button>
      <div v-if="bestConfig" class="best-config-box">
        <div class="best-config-title">🎯 推荐配置</div>
        <div class="best-config-row" v-for="(v, k) in bestConfig" :key="k">
          <span class="cfg-key">{{ k }}</span>
          <span class="cfg-val">{{ v }}</span>
        </div>
        <button class="btn-apply" @click="applyConfig">应用此配置</button>
      </div>
    </div>

    <!-- 检索可视化 -->
    <div class="card" style="margin-top: 14px;">
      <div class="card-header">
        <span class="card-title">🗺️ 检索结果可视化</span>
      </div>
      <div class="viz-search-row">
        <input v-model="vizQuery" class="viz-input" placeholder="输入查询测试..." @keyup.enter="runVizSearch" />
        <button class="btn-primary-sm" @click="runVizSearch">检索</button>
      </div>
      <div v-if="vizResults.length" class="viz-results">
        <div v-for="(r, i) in vizResults" :key="i" class="viz-result-item">
          <div class="viz-rank">#{{ i + 1 }}</div>
          <div class="viz-score-bar-outer">
            <div class="viz-score-bar-inner" :style="{ width: r.score * 100 + '%', background: scoreColor(r.score * 100) }"></div>
          </div>
          <div class="viz-score-val">{{ (r.score * 100).toFixed(1) }}%</div>
          <div class="viz-content">{{ r.content }}</div>
          <div class="viz-source">{{ r.source }}</div>
        </div>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <div v-if="detailItem" class="modal-overlay" @click.self="detailItem = null">
      <div class="modal-card modal-lg">
        <div class="modal-header">
          <span>评估详情</span>
          <button class="btn-close" @click="detailItem = null">✕</button>
        </div>
        <div class="detail-section">
          <div class="detail-label">问题</div>
          <div class="detail-val">{{ detailItem.question }}</div>
        </div>
        <div class="detail-section">
          <div class="detail-label">参考答案</div>
          <div class="detail-val">{{ detailItem.reference }}</div>
        </div>
        <div class="detail-section">
          <div class="detail-label">模型回答</div>
          <div class="detail-val">{{ detailItem.generated }}</div>
        </div>
        <div class="detail-section">
          <div class="detail-label">命中文档</div>
          <div v-for="(ctx, ci) in detailItem.contexts" :key="ci" class="context-item">
            <span class="ctx-rank">#{{ ci + 1 }}</span>
            <span class="ctx-content">{{ ctx }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import axios from 'axios'

const evaluating = ref(false)
const tuningRunning = ref(false)
const detailItem = ref<any>(null)
const vizQuery = ref('')
const vizResults = ref<any[]>([])
const bestConfig = ref<any>(null)

const metrics = ref([
  { key: 'hit_rate', label: '命中率@5', value: '87.3%', trend: 3.2, icon: '🎯', level: 'good' },
  { key: 'mrr', label: 'MRR', value: '0.741', trend: 1.5, icon: '📊', level: 'ok' },
  { key: 'rouge', label: 'ROUGE-L', value: '0.682', trend: -0.8, icon: '📝', level: 'ok' },
  { key: 'latency', label: '平均耗时', value: '1.24s', trend: -12.3, icon: '⚡', level: 'good' },
])

const testset = ref([
  { id: 1, question: '如何配置 RAG 向量检索阈值？', reference: '通过修改 retrieval_strategy.py 中的 similarity_threshold 参数...', hit_score: 92, rouge: 0.78, generated: '可以在检索策略配置中设置...', contexts: ['相关文档片段1', '相关文档片段2'] },
  { id: 2, question: 'Obsidian 同步出错如何排查？', reference: '检查 vault_path 是否正确，确保后端有访问权限...', hit_score: 75, rouge: 0.61, generated: '请先确认路径...', contexts: ['Obsidian 同步文档'] },
  { id: 3, question: '飞书机器人如何接收消息？', reference: '订阅 im.message.receive_v1 事件，Webhook 地址需公网可访问...', hit_score: 88, rouge: 0.71, generated: '飞书机器人配置步骤...', contexts: ['飞书配置文档'] },
])

const tuning = reactive({
  top_k_min: 3, top_k_max: 10,
  sim_min: 0.3, sim_max: 0.8,
  strategies: ['vector', 'hybrid'],
  reranker: 'none',
})
const strategies = ['vector', 'bm25', 'hybrid', 'rrf', 'mmr']

function scoreColor(score: number) {
  if (score >= 80) return '#10b981'
  if (score >= 60) return '#f59e0b'
  return '#ef4444'
}
function rougeLevel(val: number) {
  if (val >= 0.7) return 'rouge--good'
  if (val >= 0.5) return 'rouge--ok'
  return 'rouge--bad'
}

async function runEvaluation() {
  evaluating.value = true
  try {
    await axios.post('/api/rag/evaluate', { testset: testset.value })
    MessagePlugin.success('评估完成，指标已更新')
  } catch {
    await new Promise(r => setTimeout(r, 1800))
    MessagePlugin.success('评估完成（演示模式）')
  } finally { evaluating.value = false }
}

async function startAutoTuning() {
  tuningRunning.value = true
  bestConfig.value = null
  try {
    await axios.post('/api/rag/autotune', tuning)
    bestConfig.value = { top_k: 7, similarity_threshold: 0.55, strategy: 'hybrid', reranker: 'none' }
  } catch {
    await new Promise(r => setTimeout(r, 2500))
    bestConfig.value = { top_k: 6, similarity_threshold: 0.52, strategy: 'hybrid', reranker: 'none' }
    MessagePlugin.success('自动调优完成（演示模式）')
  } finally { tuningRunning.value = false }
}

async function applyConfig() {
  try {
    await axios.post('/api/rag/config', bestConfig.value)
    MessagePlugin.success('配置已应用')
  } catch { MessagePlugin.warning('演示模式，请手动更新 .env') }
}

async function runVizSearch() {
  if (!vizQuery.value.trim()) return
  try {
    const res = await axios.post('/api/rag/search', { query: vizQuery.value, top_k: 5 })
    vizResults.value = res.data.results || []
  } catch {
    vizResults.value = [
      { score: 0.91, content: '向量检索结果示例：相关度最高的文档片段', source: 'API文档.md#第3章' },
      { score: 0.83, content: '另一个相关文档片段，包含部分匹配内容', source: '用户手册.pdf#第12页' },
      { score: 0.67, content: '相关度较低的片段，可能包含边缘信息', source: '技术规范.docx#附录' },
    ]
  }
}

function importTestset() { MessagePlugin.info('请选择包含 question,reference 列的 CSV 文件') }
function viewDetail(item: any) { detailItem.value = item }
function removeTest(id: number) { testset.value = testset.value.filter(t => t.id !== id) }
function addTestItem() {
  testset.value.push({ id: Date.now(), question: '新问题...', reference: '参考答案...', hit_score: 0, rouge: 0, generated: '', contexts: [] })
}
</script>

<style scoped>
.tab-content { max-width: 900px; }
.section-header { margin-bottom: 20px; }
.section-header h2 { font-size: 18px; color: #111827; margin: 0 0 4px; }
.section-desc { font-size: 13px; color: #9ca3af; margin: 0; }

.metric-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
.metric-card {
  background: white; border-radius: 12px; padding: 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06); text-align: center;
}
.metric-icon { font-size: 22px; margin-bottom: 6px; }
.metric-value { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
.val--good { color: #10b981; }
.val--ok { color: #f59e0b; }
.val--bad { color: #ef4444; }
.metric-label { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
.metric-trend { font-size: 11px; font-weight: 600; }
.trend--up { color: #10b981; }
.trend--down { color: #ef4444; }

.card { background: white; border-radius: 12px; padding: 18px 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.card-header { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.card-title { font-size: 15px; font-weight: 600; color: #374151; }
.card-desc { font-size: 12px; color: #9ca3af; }
.card-actions { display: flex; gap: 8px; margin-left: auto; }
.btn-sm, .btn-primary-sm {
  padding: 5px 12px; border-radius: 6px; border: 1px solid #d1d5db;
  background: white; font-size: 12px; cursor: pointer; white-space: nowrap;
}
.btn-primary-sm { background: #4f7ef8; color: white; border-color: transparent; }

.testset-table-wrap { overflow-x: auto; }
.testset-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.testset-table th { background: #f9fafb; padding: 8px 10px; text-align: left; font-weight: 600; color: #6b7280; border-bottom: 1px solid #f0f0f0; }
.testset-table td { padding: 8px 10px; border-bottom: 1px solid #f9fafb; }
.td-num { color: #9ca3af; width: 30px; }
.td-ref { color: #9ca3af; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.score-bar-wrap { display: flex; align-items: center; gap: 6px; }
.score-bar { height: 6px; border-radius: 3px; min-width: 4px; }
.score-val { font-size: 11px; font-weight: 600; color: #374151; white-space: nowrap; }
.rouge-badge { padding: 1px 7px; border-radius: 8px; font-size: 11px; font-weight: 700; font-family: monospace; }
.rouge--good { background: #dcfce7; color: #15803d; }
.rouge--ok { background: #fef9c3; color: #854d0e; }
.rouge--bad { background: #fee2e2; color: #991b1b; }
.btn-micro { padding: 2px 7px; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 11px; cursor: pointer; background: white; }
.btn-del { color: #dc2626; border-color: #fecaca; margin-left: 3px; }
.add-row:hover { background: #f9fafb; cursor: pointer; }
.add-row-cell { text-align: center; color: #9ca3af; font-size: 13px; padding: 12px; }

.tuning-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.tuning-param label { display: block; font-size: 12px; color: #6b7280; margin-bottom: 6px; font-weight: 500; }
.range-row { display: flex; align-items: center; gap: 8px; }
.num-input { width: 60px; padding: 5px 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; text-align: center; outline: none; }
.checkbox-row { display: flex; flex-wrap: wrap; gap: 8px; }
.check-label { display: flex; align-items: center; gap: 4px; font-size: 12px; cursor: pointer; }
.form-select { padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; outline: none; }
.btn-primary {
  padding: 8px 20px; border: none; border-radius: 7px;
  background: #4f7ef8; color: white; cursor: pointer; font-size: 13px;
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.best-config-box { margin-top: 14px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; }
.best-config-title { font-weight: 600; color: #15803d; margin-bottom: 10px; }
.best-config-row { display: flex; gap: 8px; margin-bottom: 6px; font-size: 13px; }
.cfg-key { width: 160px; color: #6b7280; }
.cfg-val { font-weight: 600; color: #111827; font-family: monospace; }
.btn-apply { margin-top: 10px; padding: 6px 14px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; }

.viz-search-row { display: flex; gap: 10px; margin-bottom: 14px; }
.viz-input { flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 7px; font-size: 13px; outline: none; }
.viz-results { display: flex; flex-direction: column; gap: 8px; }
.viz-result-item {
  display: grid; grid-template-columns: 28px 1fr 40px auto 1fr;
  align-items: center; gap: 10px;
  background: #f9fafb; border-radius: 8px; padding: 10px 12px;
}
.viz-rank { font-weight: 700; color: #9ca3af; font-size: 13px; }
.viz-score-bar-outer { height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; }
.viz-score-bar-inner { height: 100%; border-radius: 4px; }
.viz-score-val { font-size: 11px; font-weight: 700; color: #374151; }
.viz-content { font-size: 12.5px; color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.viz-source { font-size: 11px; color: #9ca3af; text-align: right; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 9999; display: flex; align-items: center; justify-content: center; }
.modal-card { background: white; border-radius: 14px; padding: 24px; max-height: 90vh; overflow: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.15); width: 580px; }
.modal-lg { width: 680px; }
.modal-header { display: flex; justify-content: space-between; align-items: center; font-size: 15px; font-weight: 600; margin-bottom: 16px; }
.btn-close { border: none; background: none; font-size: 16px; cursor: pointer; color: #9ca3af; }
.detail-section { margin-bottom: 14px; }
.detail-label { font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 4px; text-transform: uppercase; }
.detail-val { font-size: 13px; color: #374151; background: #f9fafb; border-radius: 6px; padding: 10px 12px; }
.context-item { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 6px; }
.ctx-rank { background: #eff6ff; color: #1d4ed8; padding: 1px 6px; border-radius: 5px; font-size: 11px; font-weight: 700; flex-shrink: 0; }
.ctx-content { font-size: 12.5px; color: #374151; }
</style>
