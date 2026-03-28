<template>
  <div class="tab-content">
    <div class="section-header">
      <h2>RBAC 角色权限</h2>
      <p class="section-desc">基于角色的访问控制系统，精细管理用户对知识库、文档、API 的权限</p>
    </div>

    <!-- 子菜单 -->
    <div class="sub-tabs">
      <button v-for="t in subTabs" :key="t.id"
        :class="['sub-tab', { active: activeSubTab === t.id }]"
        @click="activeSubTab = t.id">{{ t.label }}</button>
    </div>

    <!-- 角色管理 -->
    <div v-if="activeSubTab === 'roles'">
      <div class="toolbar">
        <span class="toolbar-title">系统角色</span>
        <button class="btn-primary" @click="showRoleModal = true">+ 新建角色</button>
      </div>
      <div class="role-grid">
        <div v-for="role in roles" :key="role.id" class="role-card" :style="{ borderColor: role.color }">
          <div class="role-card__badge" :style="{ background: role.color }">{{ role.icon }}</div>
          <div class="role-card__name">{{ role.name }}</div>
          <div class="role-card__desc">{{ role.desc }}</div>
          <div class="role-card__members">{{ role.member_count }} 名成员</div>
          <div class="role-card__perms">
            <span v-for="p in role.perms.slice(0,3)" :key="p" class="perm-tag">{{ p }}</span>
            <span v-if="role.perms.length > 3" class="perm-more">+{{ role.perms.length - 3 }}</span>
          </div>
          <div class="role-card__actions">
            <button class="btn-sm" @click="editRole(role)">编辑权限</button>
            <button class="btn-sm btn-danger" v-if="!role.system" @click="deleteRole(role)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 用户管理 -->
    <div v-if="activeSubTab === 'users'">
      <div class="toolbar">
        <input v-model="userSearch" class="search-input" placeholder="搜索用户邮箱..." />
        <select v-model="roleFilter" class="filter-select">
          <option value="">全部角色</option>
          <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
        </select>
      </div>
      <div class="user-table-wrap">
        <table class="user-table">
          <thead>
            <tr>
              <th>用户</th><th>邮箱</th><th>角色</th><th>加入时间</th><th>状态</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in filteredUsers" :key="user.id">
              <td>
                <div class="user-avatar-row">
                  <div class="user-avatar" :style="{ background: user.color }">{{ user.name[0] }}</div>
                  {{ user.name }}
                </div>
              </td>
              <td class="td-mono">{{ user.email }}</td>
              <td>
                <select class="role-select" :value="user.role_id" @change="changeUserRole(user, ($event.target as HTMLSelectElement).value)">
                  <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
                </select>
              </td>
              <td>{{ formatDate(user.joined_at) }}</td>
              <td><span :class="['status-dot', user.active ? 'dot--active' : 'dot--inactive']">{{ user.active ? '活跃' : '禁用' }}</span></td>
              <td>
                <button class="btn-sm" @click="toggleUserStatus(user)">{{ user.active ? '禁用' : '启用' }}</button>
                <button class="btn-sm btn-danger ml4" @click="removeUser(user)">移除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 权限矩阵 -->
    <div v-if="activeSubTab === 'matrix'">
      <div class="matrix-desc">权限矩阵展示每个角色对各资源的读/写/删/管理权限</div>
      <div class="matrix-wrap">
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="matrix-resource">资源 / 角色</th>
              <th v-for="role in roles" :key="role.id">
                <div class="matrix-role-header">
                  <span class="matrix-role-dot" :style="{ background: role.color }"></span>
                  {{ role.name }}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="res in resources" :key="res.id">
              <td class="matrix-resource-name">{{ res.icon }} {{ res.name }}</td>
              <td v-for="role in roles" :key="role.id" class="matrix-cell">
                <div class="perm-toggles">
                  <label v-for="perm in permTypes" :key="perm.key" class="perm-toggle"
                    :title="perm.label">
                    <input type="checkbox"
                      :checked="hasPermission(role.id, res.id, perm.key)"
                      @change="togglePermission(role.id, res.id, perm.key, ($event.target as HTMLInputElement).checked)"
                      :disabled="role.system && perm.key === 'read'" />
                    {{ perm.icon }}
                  </label>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <button class="btn-primary" style="margin-top:14px" @click="saveMatrix">保存权限矩阵</button>
    </div>

    <!-- 新建角色弹窗 -->
    <div v-if="showRoleModal" class="modal-overlay" @click.self="showRoleModal = false">
      <div class="modal-card">
        <h3>新建角色</h3>
        <div class="form-group">
          <label>角色名称</label>
          <input v-model="newRole.name" class="form-input" placeholder="如：内容审核员" />
        </div>
        <div class="form-group">
          <label>描述</label>
          <input v-model="newRole.desc" class="form-input" placeholder="角色职责说明" />
        </div>
        <div class="form-group">
          <label>颜色标识</label>
          <div class="color-picker">
            <div v-for="c in colorOptions" :key="c"
              :class="['color-dot', { selected: newRole.color === c }]"
              :style="{ background: c }"
              @click="newRole.color = c"></div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showRoleModal = false">取消</button>
          <button class="btn-confirm" @click="createRole">创建</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import axios from 'axios'

const activeSubTab = ref('roles')
const subTabs = [
  { id: 'roles', label: '🎭 角色列表' },
  { id: 'users', label: '👥 用户管理' },
  { id: 'matrix', label: '🗂️ 权限矩阵' },
]

const showRoleModal = ref(false)
const userSearch = ref('')
const roleFilter = ref('')
const newRole = reactive({ name: '', desc: '', color: '#4f7ef8' })
const colorOptions = ['#4f7ef8', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']

const roles = ref([
  { id: 'admin', name: '管理员', icon: '👑', color: '#ef4444', desc: '拥有所有权限', member_count: 2, system: true, perms: ['全部权限', '用户管理', '系统配置', 'API访问'] },
  { id: 'editor', name: '编辑者', icon: '✏️', color: '#4f7ef8', desc: '可编辑知识库内容', member_count: 8, system: true, perms: ['知识库读写', '文档上传', 'RAG对话', 'API访问'] },
  { id: 'viewer', name: '访客', icon: '👁️', color: '#10b981', desc: '只可查看和对话', member_count: 24, system: true, perms: ['知识库只读', 'RAG对话'] },
  { id: 'auditor', name: '审计员', icon: '🔍', color: '#f59e0b', desc: '可查看审计日志', member_count: 1, system: false, perms: ['审计日志查看', '知识库只读'] },
])

const users = ref([
  { id: 1, name: '张三', email: 'zhangsan@example.com', role_id: 'admin', joined_at: Date.now()/1000 - 86400 * 30, active: true, color: '#ef4444' },
  { id: 2, name: '李四', email: 'lisi@example.com', role_id: 'editor', joined_at: Date.now()/1000 - 86400 * 20, active: true, color: '#4f7ef8' },
  { id: 3, name: '王五', email: 'wangwu@example.com', role_id: 'viewer', joined_at: Date.now()/1000 - 86400 * 10, active: true, color: '#10b981' },
  { id: 4, name: '赵六', email: 'zhaoliu@example.com', role_id: 'viewer', joined_at: Date.now()/1000 - 86400 * 5, active: false, color: '#8b5cf6' },
])

const resources = [
  { id: 'kb', name: '知识库', icon: '📚' },
  { id: 'doc', name: '文档', icon: '📄' },
  { id: 'chat', name: 'RAG对话', icon: '💬' },
  { id: 'audit', name: '审计日志', icon: '📋' },
  { id: 'api', name: 'API Key', icon: '🔑' },
  { id: 'settings', name: '系统设置', icon: '⚙️' },
]

const permTypes = [
  { key: 'read', label: '读取', icon: '👁' },
  { key: 'write', label: '写入', icon: '✏' },
  { key: 'delete', label: '删除', icon: '🗑' },
  { key: 'manage', label: '管理', icon: '⚙' },
]

// 权限矩阵状态（role_id:res_id:perm_key -> boolean）
const permMatrix = reactive<Record<string, boolean>>({
  'admin:kb:read': true, 'admin:kb:write': true, 'admin:kb:delete': true, 'admin:kb:manage': true,
  'admin:doc:read': true, 'admin:doc:write': true, 'admin:doc:delete': true, 'admin:doc:manage': true,
  'admin:chat:read': true, 'admin:chat:write': true, 'admin:settings:read': true, 'admin:settings:manage': true,
  'editor:kb:read': true, 'editor:kb:write': true, 'editor:doc:read': true, 'editor:doc:write': true,
  'editor:chat:read': true, 'editor:chat:write': true, 'editor:api:read': true,
  'viewer:kb:read': true, 'viewer:doc:read': true, 'viewer:chat:read': true, 'viewer:chat:write': true,
  'auditor:audit:read': true, 'auditor:kb:read': true, 'auditor:doc:read': true,
})

function hasPermission(roleId: string, resId: string, permKey: string) {
  return !!permMatrix[`${roleId}:${resId}:${permKey}`]
}
function togglePermission(roleId: string, resId: string, permKey: string, value: boolean) {
  permMatrix[`${roleId}:${resId}:${permKey}`] = value
}

const filteredUsers = computed(() => {
  return users.value.filter(u => {
    const emailOk = !userSearch.value || u.email.includes(userSearch.value) || u.name.includes(userSearch.value)
    const roleOk = !roleFilter.value || u.role_id === roleFilter.value
    return emailOk && roleOk
  })
})

function changeUserRole(user: any, roleId: string) {
  user.role_id = roleId
  MessagePlugin.success(`已将 ${user.name} 角色更改为 ${roles.value.find(r => r.id === roleId)?.name}`)
}
function toggleUserStatus(user: any) {
  user.active = !user.active
  MessagePlugin.success(`用户 ${user.name} 已${user.active ? '启用' : '禁用'}`)
}
function removeUser(user: any) {
  if (confirm(`确定移除用户 ${user.name}？`)) {
    users.value = users.value.filter(u => u.id !== user.id)
    MessagePlugin.success('已移除')
  }
}
function editRole(role: any) { MessagePlugin.info(`编辑角色「${role.name}」- 权限矩阵 Tab 中可调整具体权限`) }
function deleteRole(role: any) {
  if (confirm(`删除角色「${role.name}」？`)) {
    roles.value = roles.value.filter(r => r.id !== role.id)
    MessagePlugin.success('已删除')
  }
}
function createRole() {
  if (!newRole.name.trim()) { MessagePlugin.warning('请填写角色名称'); return }
  roles.value.push({
    id: `custom_${Date.now()}`, name: newRole.name, icon: '🎭',
    color: newRole.color, desc: newRole.desc, member_count: 0, system: false, perms: []
  })
  Object.assign(newRole, { name: '', desc: '', color: '#4f7ef8' })
  showRoleModal.value = false
  MessagePlugin.success('角色已创建')
}
async function saveMatrix() {
  try {
    await axios.post('/api/rbac/permissions', { matrix: permMatrix })
    MessagePlugin.success('权限矩阵已保存')
  } catch { MessagePlugin.warning('演示模式，配置已本地暂存') }
}
function formatDate(ts: number) { return new Date(ts * 1000).toLocaleDateString('zh-CN') }
</script>

<style scoped>
.tab-content { max-width: 1000px; }
.section-header { margin-bottom: 16px; }
.section-header h2 { font-size: 18px; color: #111827; margin: 0 0 4px; }
.section-desc { font-size: 13px; color: #9ca3af; margin: 0; }

.sub-tabs { display: flex; gap: 4px; margin-bottom: 18px; }
.sub-tab {
  padding: 6px 16px; border-radius: 7px; border: 1px solid #e5e7eb;
  background: white; cursor: pointer; font-size: 13px; color: #6b7280;
}
.sub-tab.active { background: #eff6ff; border-color: #4f7ef8; color: #4f7ef8; font-weight: 600; }

.toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.toolbar-title { font-size: 15px; font-weight: 600; color: #374151; }
.btn-primary {
  margin-left: auto; padding: 7px 16px; border: none; border-radius: 7px;
  background: #4f7ef8; color: white; cursor: pointer; font-size: 13px;
}
.search-input, .filter-select {
  padding: 7px 12px; border: 1px solid #e5e7eb; border-radius: 7px;
  font-size: 13px; outline: none;
}
.search-input { flex: 1; }

.role-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.role-card {
  background: white; border-radius: 12px; padding: 16px; border: 2px solid #f0f0f0;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05); transition: border-color 0.2s;
}
.role-card:hover { border-color: currentColor; }
.role-card__badge {
  width: 40px; height: 40px; border-radius: 10px; font-size: 20px;
  display: flex; align-items: center; justify-content: center; margin-bottom: 10px; opacity: 0.85;
}
.role-card__name { font-size: 15px; font-weight: 700; color: #111827; margin-bottom: 4px; }
.role-card__desc { font-size: 12px; color: #6b7280; margin-bottom: 8px; }
.role-card__members { font-size: 12px; color: #9ca3af; margin-bottom: 10px; }
.role-card__perms { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 12px; }
.perm-tag { padding: 2px 7px; background: #f3f4f6; border-radius: 6px; font-size: 11px; color: #374151; }
.perm-more { padding: 2px 7px; background: #e5e7eb; border-radius: 6px; font-size: 11px; color: #6b7280; }
.role-card__actions { display: flex; gap: 8px; }
.btn-sm {
  padding: 4px 10px; border: 1px solid #d1d5db; border-radius: 5px;
  background: white; font-size: 12px; cursor: pointer;
}
.btn-danger { border-color: #fecaca; color: #dc2626; background: #fff5f5; }
.ml4 { margin-left: 4px; }

.user-table-wrap { background: white; border-radius: 10px; overflow: auto; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.user-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.user-table th { background: #f9fafb; padding: 10px 12px; text-align: left; font-weight: 600; color: #6b7280; border-bottom: 1px solid #f0f0f0; }
.user-table td { padding: 10px 12px; border-bottom: 1px solid #f9fafb; }
.user-table tr:last-child td { border-bottom: none; }
.user-avatar-row { display: flex; align-items: center; gap: 8px; }
.user-avatar { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 13px; font-weight: 700; flex-shrink: 0; }
.td-mono { font-family: monospace; font-size: 12px; color: #6b7280; }
.role-select { padding: 3px 8px; border: 1px solid #e5e7eb; border-radius: 5px; font-size: 12px; outline: none; }
.status-dot { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
.dot--active { background: #dcfce7; color: #15803d; }
.dot--inactive { background: #f3f4f6; color: #9ca3af; }

.matrix-desc { font-size: 13px; color: #6b7280; margin-bottom: 14px; }
.matrix-wrap { overflow-x: auto; }
.matrix-table { border-collapse: collapse; font-size: 12px; min-width: 600px; }
.matrix-table th, .matrix-table td { border: 1px solid #f0f0f0; padding: 8px 10px; }
.matrix-table th { background: #f9fafb; font-weight: 600; color: #374151; }
.matrix-resource { min-width: 130px; }
.matrix-role-header { display: flex; align-items: center; gap: 5px; }
.matrix-role-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.matrix-resource-name { font-weight: 500; color: #374151; white-space: nowrap; }
.matrix-cell { text-align: center; }
.perm-toggles { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; }
.perm-toggle { cursor: pointer; font-size: 14px; user-select: none; }
.perm-toggle input { display: none; }
.perm-toggle:has(input:not(:checked)) { opacity: 0.3; }
.perm-toggle:has(input:disabled) { cursor: not-allowed; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 9999; display: flex; align-items: center; justify-content: center; }
.modal-card { background: white; border-radius: 14px; padding: 24px; width: 400px; box-shadow: 0 20px 60px rgba(0,0,0,0.15); }
.modal-card h3 { margin: 0 0 16px; font-size: 16px; }
.form-group { margin-bottom: 14px; }
.form-group label { display: block; font-size: 12px; color: #6b7280; margin-bottom: 5px; font-weight: 500; }
.form-input { width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 7px; font-size: 13px; outline: none; box-sizing: border-box; }
.color-picker { display: flex; gap: 10px; flex-wrap: wrap; }
.color-dot { width: 26px; height: 26px; border-radius: 50%; cursor: pointer; border: 3px solid transparent; transition: transform 0.1s; }
.color-dot.selected { border-color: rgba(0,0,0,0.3); transform: scale(1.15); }
.modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; }
.btn-cancel { padding: 8px 16px; border: 1px solid #d1d5db; border-radius: 7px; background: white; cursor: pointer; font-size: 13px; }
.btn-confirm { padding: 8px 16px; border: none; border-radius: 7px; background: #4f7ef8; color: white; cursor: pointer; font-size: 13px; }
</style>
