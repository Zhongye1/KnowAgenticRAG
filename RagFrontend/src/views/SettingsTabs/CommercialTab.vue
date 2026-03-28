<template>
  <div class="tab-content">
    <div class="section-header">
      <h2>商业化管理</h2>
      <p class="section-desc">套餐订阅、配额使用、工单系统与收益统计</p>
    </div>

    <!-- 当前套餐 -->
    <div class="current-plan">
      <div class="plan-info">
        <span class="plan-badge" :class="`plan--${currentPlan.tier}`">{{ currentPlan.label }}</span>
        <span class="plan-expire" v-if="currentPlan.tier !== 'free'">
          有效至 {{ formatDate(currentPlan.expire_at) }}
        </span>
      </div>
      <div class="plan-quotas">
        <div v-for="q in quotas" :key="q.key" class="quota-item">
          <div class="quota-header">
            <span>{{ q.label }}</span>
            <span class="quota-vals">{{ q.used }} / {{ q.limit }}</span>
          </div>
          <div class="quota-bar">
            <div class="quota-fill" :style="{ width: Math.min(q.used / q.limit * 100, 100) + '%', background: quotaColor(q.used, q.limit) }"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 套餐选择 -->
    <div class="plans-title">选择套餐</div>
    <div class="plans-grid">
      <div v-for="plan in plans" :key="plan.id"
        :class="['plan-card', { 'plan-card--current': currentPlan.tier === plan.id, 'plan-card--popular': plan.popular }]">
        <div v-if="plan.popular" class="popular-tag">最受欢迎</div>
        <div class="plan-card-header">
          <div class="plan-icon">{{ plan.icon }}</div>
          <div class="plan-name">{{ plan.name }}</div>
          <div class="plan-price">
            <span class="price-main">{{ plan.price }}</span>
            <span class="price-unit" v-if="plan.price_unit">{{ plan.price_unit }}</span>
          </div>
        </div>
        <div class="plan-features">
          <div v-for="feat in plan.features" :key="feat" class="feature-item">
            <span class="feat-check">✓</span>
            {{ feat }}
          </div>
        </div>
        <button
          :class="['btn-plan', currentPlan.tier === plan.id ? 'btn-plan--current' : 'btn-plan--upgrade']"
          :disabled="currentPlan.tier === plan.id"
          @click="upgradePlan(plan)">
          {{ currentPlan.tier === plan.id ? '当前套餐' : plan.id === 'free' ? '降级' : '立即升级' }}
        </button>
      </div>
    </div>

    <!-- 使用统计 -->
    <div class="stats-section">
      <div class="stats-title">本月使用统计</div>
      <div class="stats-grid">
        <div class="stat-card" v-for="s in monthStats" :key="s.key">
          <div class="stat-icon">{{ s.icon }}</div>
          <div class="stat-val">{{ s.value }}</div>
          <div class="stat-label">{{ s.label }}</div>
          <div class="stat-trend" :class="s.up ? 'trend--up' : 'trend--down'">
            {{ s.up ? '↑' : '↓' }} {{ s.change }}
          </div>
        </div>
      </div>
    </div>

    <!-- 工单系统 -->
    <div class="ticket-section">
      <div class="ticket-header">
        <span class="section-title">🎫 工单管理</span>
        <button class="btn-new-ticket" @click="showTicketModal = true">+ 提交工单</button>
      </div>
      <div class="ticket-list">
        <div v-for="ticket in tickets" :key="ticket.id" class="ticket-row">
          <span class="ticket-id">#{{ ticket.id }}</span>
          <span class="ticket-title">{{ ticket.title }}</span>
          <span :class="['ticket-type', `type--${ticket.type}`]">{{ typeLabels[ticket.type] }}</span>
          <span :class="['ticket-status', `ts--${ticket.status}`]">{{ statusLabels[ticket.status] }}</span>
          <span class="ticket-time">{{ formatDateTime(ticket.created_at) }}</span>
          <button class="btn-micro" @click="viewTicket(ticket)">查看</button>
        </div>
        <div v-if="tickets.length === 0" class="empty-hint">暂无工单</div>
      </div>
    </div>

    <!-- 新建工单弹窗 -->
    <div v-if="showTicketModal" class="modal-overlay" @click.self="showTicketModal = false">
      <div class="modal-card">
        <h3>提交工单</h3>
        <div class="form-group">
          <label>工单类型</label>
          <select v-model="newTicket.type" class="form-select">
            <option value="billing">计费问题</option>
            <option value="technical">技术支持</option>
            <option value="feature">功能建议</option>
            <option value="bug">Bug 反馈</option>
          </select>
        </div>
        <div class="form-group">
          <label>标题</label>
          <input v-model="newTicket.title" class="form-input" placeholder="简述您的问题..." />
        </div>
        <div class="form-group">
          <label>详细描述</label>
          <textarea v-model="newTicket.content" class="form-textarea" rows="5" placeholder="请详细描述问题..."></textarea>
        </div>
        <div class="form-group">
          <label>优先级</label>
          <div class="priority-row">
            <label v-for="p in priorities" :key="p.value" :class="['priority-btn', { active: newTicket.priority === p.value }]">
              <input type="radio" :value="p.value" v-model="newTicket.priority" />
              {{ p.label }}
            </label>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showTicketModal = false">取消</button>
          <button class="btn-confirm" @click="submitTicket">提交</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import axios from 'axios'

const showTicketModal = ref(false)
const currentPlan = reactive({ tier: 'free', label: '免费版', expire_at: 0 })

const quotas = ref([
  { key: 'storage', label: '存储空间', used: 0.8, limit: 1 },
  { key: 'kb', label: '知识库数量', used: 2, limit: 3 },
  { key: 'calls', label: '今日 API 调用', used: 142, limit: 500 },
  { key: 'members', label: '团队成员', used: 3, limit: 5 },
])

const plans = [
  {
    id: 'free', icon: '🆓', name: '免费版', price: '¥0', price_unit: '/月', popular: false,
    features: ['3 个知识库', '1GB 存储', '每日 500 次调用', '5 名成员', '社区支持'],
  },
  {
    id: 'pro', icon: '⚡', name: 'Pro 版', price: '¥39', price_unit: '/月', popular: true,
    features: ['无限知识库', '20GB 存储', '每日 5000 次调用', '20 名成员', 'RAG 高级策略', '优先技术支持', '数据脱敏'],
  },
  {
    id: 'enterprise', icon: '🏢', name: '企业版', price: '联系销售', price_unit: '', popular: false,
    features: ['私有化部署', '无限存储', '无限调用', '无限成员', 'SSO 单点登录', 'RBAC 权限', 'SLA 99.9%', '专属客户成功'],
  },
]

const monthStats = ref([
  { key: 'calls', icon: '📡', value: '4,820', label: 'API 调用', up: true, change: '+12%' },
  { key: 'tokens', icon: '🔤', value: '1.2M', label: 'Token 消耗', up: true, change: '+8%' },
  { key: 'docs', icon: '📄', value: '38', label: '文档上传', up: false, change: '-5%' },
  { key: 'users', icon: '👥', value: '3', label: '活跃成员', up: true, change: '+1' },
])

const tickets = ref([
  { id: 1001, title: '上传 PDF 时报错 500', type: 'bug', status: 'open', created_at: Date.now()/1000 - 3600 },
  { id: 1002, title: '能否支持 Word 文档导出', type: 'feature', status: 'processing', created_at: Date.now()/1000 - 86400 },
])

const typeLabels: Record<string, string> = { billing: '计费', technical: '技术', feature: '建议', bug: 'Bug' }
const statusLabels: Record<string, string> = { open: '待处理', processing: '处理中', resolved: '已解决', closed: '已关闭' }

const newTicket = reactive({ type: 'technical', title: '', content: '', priority: 'normal' })
const priorities = [
  { value: 'low', label: '低' },
  { value: 'normal', label: '普通' },
  { value: 'high', label: '高' },
  { value: 'urgent', label: '紧急' },
]

function quotaColor(used: number, limit: number) {
  const pct = used / limit
  if (pct >= 0.9) return '#ef4444'
  if (pct >= 0.7) return '#f59e0b'
  return '#10b981'
}

function upgradePlan(plan: any) {
  if (plan.id === 'enterprise') {
    MessagePlugin.info('请联系销售：sales@ragf.ai 或拨打 400-xxx-xxxx')
    return
  }
  MessagePlugin.success(`正在跳转到 ${plan.name} 购买页...`)
}

async function submitTicket() {
  if (!newTicket.title.trim()) { MessagePlugin.warning('请填写标题'); return }
  try {
    await axios.post('/api/billing/tickets', newTicket)
    tickets.value.unshift({
      id: Math.floor(Math.random() * 9000 + 1000),
      title: newTicket.title, type: newTicket.type, status: 'open',
      created_at: Date.now() / 1000,
    })
    showTicketModal.value = false
    Object.assign(newTicket, { title: '', content: '', type: 'technical', priority: 'normal' })
    MessagePlugin.success('工单已提交，我们将在 24h 内响应')
  } catch {
    MessagePlugin.warning('演示模式，工单已本地记录')
    showTicketModal.value = false
  }
}

function viewTicket(t: any) { MessagePlugin.info(`工单 #${t.id}：${statusLabels[t.status]}`) }
function formatDate(ts: number) { return new Date(ts * 1000).toLocaleDateString('zh-CN') }
function formatDateTime(ts: number) { return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false }) }
</script>

<style scoped>
.tab-content { max-width: 900px; }
.section-header { margin-bottom: 16px; }
.section-header h2 { font-size: 18px; color: #111827; margin: 0 0 4px; }
.section-desc { font-size: 13px; color: #9ca3af; margin: 0; }

.current-plan { background: white; border-radius: 12px; padding: 18px 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); margin-bottom: 20px; }
.plan-info { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.plan-badge { padding: 3px 12px; border-radius: 12px; font-size: 13px; font-weight: 700; }
.plan--free { background: #f3f4f6; color: #6b7280; }
.plan--pro { background: #eff6ff; color: #1d4ed8; }
.plan--enterprise { background: linear-gradient(135deg, #fef3c7, #fde68a); color: #92400e; }
.plan-expire { font-size: 13px; color: #9ca3af; }

.plan-quotas { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.quota-item {}
.quota-header { display: flex; justify-content: space-between; font-size: 12px; color: #6b7280; margin-bottom: 4px; }
.quota-vals { font-weight: 600; color: #374151; }
.quota-bar { height: 7px; background: #f3f4f6; border-radius: 4px; overflow: hidden; }
.quota-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }

.plans-title { font-size: 15px; font-weight: 600; color: #374151; margin-bottom: 12px; }
.plans-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 24px; }
.plan-card {
  background: white; border-radius: 14px; padding: 18px; position: relative;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06); border: 2px solid transparent; transition: border-color 0.2s;
}
.plan-card--current { border-color: #4f7ef8; }
.plan-card--popular { border-color: #f59e0b; }
.popular-tag { position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: #f59e0b; color: white; padding: 2px 14px; border-radius: 12px; font-size: 11px; font-weight: 700; white-space: nowrap; }
.plan-card-header { text-align: center; margin-bottom: 14px; }
.plan-icon { font-size: 28px; margin-bottom: 6px; }
.plan-name { font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 4px; }
.plan-price { margin-top: 4px; }
.price-main { font-size: 22px; font-weight: 800; color: #4f7ef8; }
.price-unit { font-size: 12px; color: #9ca3af; }
.plan-features { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.feature-item { font-size: 13px; color: #374151; display: flex; align-items: flex-start; gap: 6px; }
.feat-check { color: #10b981; font-weight: 700; flex-shrink: 0; }
.btn-plan { width: 100%; padding: 9px; border-radius: 8px; border: none; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.15s; }
.btn-plan--current { background: #f3f4f6; color: #9ca3af; cursor: not-allowed; }
.btn-plan--upgrade { background: #4f7ef8; color: white; }
.btn-plan--upgrade:hover { background: #3b6fd4; }

.stats-section { margin-bottom: 20px; }
.stats-title, .section-title { font-size: 15px; font-weight: 600; color: #374151; margin-bottom: 12px; }
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.stat-card { background: white; border-radius: 12px; padding: 14px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
.stat-icon { font-size: 22px; margin-bottom: 6px; }
.stat-val { font-size: 20px; font-weight: 700; color: #111827; }
.stat-label { font-size: 12px; color: #9ca3af; margin: 2px 0; }
.stat-trend { font-size: 12px; font-weight: 600; }
.trend--up { color: #10b981; }
.trend--down { color: #ef4444; }

.ticket-section { background: white; border-radius: 12px; padding: 18px 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.ticket-header { display: flex; align-items: center; margin-bottom: 14px; }
.btn-new-ticket { margin-left: auto; padding: 6px 14px; background: #4f7ef8; color: white; border: none; border-radius: 7px; cursor: pointer; font-size: 13px; }
.ticket-list { display: flex; flex-direction: column; gap: 6px; }
.ticket-row { display: grid; grid-template-columns: 50px 1fr 70px 70px 130px 50px; align-items: center; gap: 10px; padding: 9px 12px; background: #f9fafb; border-radius: 7px; font-size: 12.5px; }
.ticket-id { color: #9ca3af; font-family: monospace; }
.ticket-title { font-weight: 500; color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ticket-type { padding: 2px 7px; border-radius: 8px; font-size: 11px; font-weight: 600; text-align: center; }
.type--bug { background: #fee2e2; color: #991b1b; }
.type--feature { background: #eff6ff; color: #1d4ed8; }
.type--technical { background: #fef9c3; color: #854d0e; }
.type--billing { background: #f3e8ff; color: #7e22ce; }
.ticket-status { padding: 2px 7px; border-radius: 8px; font-size: 11px; font-weight: 600; text-align: center; }
.ts--open { background: #fef3c7; color: #92400e; }
.ts--processing { background: #dbeafe; color: #1d4ed8; }
.ts--resolved { background: #dcfce7; color: #15803d; }
.ts--closed { background: #f3f4f6; color: #6b7280; }
.ticket-time { font-size: 12px; color: #9ca3af; }
.btn-micro { padding: 3px 10px; border: 1px solid #e5e7eb; border-radius: 5px; background: white; font-size: 11px; cursor: pointer; }
.empty-hint { text-align: center; color: #9ca3af; font-size: 13px; padding: 20px; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 9999; display: flex; align-items: center; justify-content: center; }
.modal-card { background: white; border-radius: 14px; padding: 24px; width: 460px; box-shadow: 0 20px 60px rgba(0,0,0,0.15); }
.modal-card h3 { margin: 0 0 16px; font-size: 16px; }
.form-group { margin-bottom: 14px; }
.form-group label { display: block; font-size: 12px; color: #6b7280; margin-bottom: 5px; font-weight: 500; }
.form-input { width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 7px; font-size: 13px; outline: none; box-sizing: border-box; }
.form-select { width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 7px; font-size: 13px; outline: none; }
.form-textarea { width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 7px; font-size: 13px; outline: none; resize: vertical; box-sizing: border-box; }
.priority-row { display: flex; gap: 8px; }
.priority-btn { display: flex; align-items: center; gap: 4px; padding: 5px 12px; border: 1px solid #e5e7eb; border-radius: 6px; cursor: pointer; font-size: 13px; }
.priority-btn.active { background: #eff6ff; border-color: #4f7ef8; color: #4f7ef8; }
.priority-btn input { display: none; }
.modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; }
.btn-cancel { padding: 8px 16px; border: 1px solid #d1d5db; border-radius: 7px; background: white; cursor: pointer; font-size: 13px; }
.btn-confirm { padding: 8px 16px; border: none; border-radius: 7px; background: #4f7ef8; color: white; cursor: pointer; font-size: 13px; }
</style>
