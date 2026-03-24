<template>
    <div class="w-full max-w-md mx-auto">
        <!-- 标签切换 -->
        <div class="flex mb-8 bg-white/10 rounded-lg p-1">
            <button @click="switchMode('login')" @mouseenter="$emit('image-change', 'login')" :class="[
                'flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all duration-300',
                currentMode === 'login'
                    ? 'bg-cyan-400 text-white shadow-lg'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
            ]">
                登录
            </button>
            <button @click="switchMode('register')" @mouseenter="$emit('image-change', 'register')" :class="[
                'flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all duration-300',
                currentMode === 'register'
                    ? 'bg-cyan-400 text-white shadow-lg'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
            ]">
                注册
            </button>
        </div>

        <!-- 表单内容 -->
        <transition name="form-slide" class="col-start-2" mode="out-in">
            <form @submit.prevent="handleSubmit" :key="currentMode" class="space-y-6">
                <!-- 登录表单 -->
                <div v-if="currentMode === 'login'">
                    <h2 class="text-2xl font-light text-white mb-6 text-center">欢迎回来</h2>

                    <!-- 用户名/邮箱 -->
                    <div class="mb-4">
                        <label class="block text-white/80 text-sm font-light mb-2">邮箱</label>
                        <input v-model="loginForm.username" type="text" required autocomplete="username"
                            class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300"
                            placeholder="请输入邮箱" />
                    </div>

                    <!-- 密码 -->
                    <div class="mb-6">
                        <label class="block text-white/80 text-sm font-light mb-2">密码</label>
                        <div class="relative">
                            <input v-model="loginForm.password" :type="showPassword ? 'text' : 'password'" required
                                autocomplete="current-password"
                                class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300"
                                placeholder="请输入密码" />
                            <button type="button" @click="showPassword = !showPassword"
                                class="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/60 hover:text-white transition-colors">
                                <svg v-if="showPassword" class="w-5 h-5" fill="none" stroke="currentColor"
                                    viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z">
                                    </path>
                                </svg>
                                <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21">
                                    </path>
                                </svg>
                            </button>
                        </div>
                    </div>

                    <!-- 记住我和忘记密码 -->
                    <div class="flex items-center justify-between mb-6">
                        <label class="flex items-center">
                            <input v-model="loginForm.remember" type="checkbox"
                                class="rounded border-white/20 bg-white/10 text-cyan-400 focus:ring-cyan-400 focus:ring-offset-0" />
                            <span class="ml-2 text-sm text-white/80">记住我</span>
                        </label>
                        <button type="button" @click="showForgotPassword" @mouseenter="$emit('image-change', 'forgot')"
                            class="text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
                            忘记密码？
                        </button>
                    </div>
                </div>

                <!-- 注册表单 -->
                <div v-else>
                    <!-- 用户名或邮箱 -->
                    <div class="mb-4">
                        <label class="block text-white/80 text-sm font-light mb-2">用户名</label>
                        <input v-model="registerForm.username" type="text" required autocomplete="username"
                            class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300"
                            placeholder="请输入用户名或邮箱" />
                    </div>
                    <!-- 密码 -->
                    <div class="mb-4">
                        <label class="block text-white/80 text-sm font-light mb-2">密码</label>
                        <div class="relative">
                            <input v-model="registerForm.password" :type="showPassword ? 'text' : 'password'" required
                                autocomplete="new-password"
                                class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300"
                                placeholder="请输入密码" />
                            <button type="button" @click="showPassword = !showPassword"
                                class="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/60 hover:text-white transition-colors">
                                <svg v-if="showPassword" class="w-5 h-5" fill="none" stroke="currentColor"
                                    viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z">
                                    </path>
                                </svg>
                                <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21">
                                    </path>
                                </svg>
                            </button>
                        </div>
                    </div>

                    <!-- 确认密码 -->
                    <div class="mb-6">
                        <label class="block text-white/80 text-sm font-light mb-2">确认密码</label>
                        <input v-model="registerForm.confirmPassword" :type="showPassword ? 'text' : 'password'"
                            required autocomplete="new-password"
                            class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300"
                            placeholder="请再次输入密码"
                            :class="{ 'border-red-400': registerForm.password && registerForm.confirmPassword && registerForm.password !== registerForm.confirmPassword }" />
                        <p v-if="registerForm.password && registerForm.confirmPassword && registerForm.password !== registerForm.confirmPassword"
                            class="text-red-400 text-xs mt-1">
                            密码不匹配
                        </p>
                    </div>

                    <!-- 服务条款 -->
                    <div class="mb-6">
                        <label class="flex items-start">
                            <input v-model="registerForm.agreeTerms" type="checkbox" required
                                class="rounded border-white/20 bg-white/10 text-cyan-400 focus:ring-cyan-400 focus:ring-offset-0 mt-1" />
                            <span class="ml-2 text-sm text-white/80">
                                我已阅读并同意
                                <a href="#" class="text-cyan-400 hover:text-cyan-300 transition-colors">《服务条款》</a>
                                和
                                <a href="#" class="text-cyan-400 hover:text-cyan-300 transition-colors">《隐私政策》</a>
                            </span>
                        </label>
                    </div>
                </div>

                <!-- 提交按钮 -->
                <button type="submit" :disabled="isSubmitting || !isFormValid"
                    class="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium rounded-lg shadow-lg hover:from-cyan-600 hover:to-blue-600 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-transparent transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]">
                    <span v-if="isSubmitting" class="flex items-center justify-center">
                        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg"
                            fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4">
                            </circle>
                            <path class="opacity-75" fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
                            </path>
                        </svg>
                        {{ currentMode === 'login' ? '登录中...' : '注册中...' }}
                    </span>
                    <span v-else>
                        {{ currentMode === 'login' ? '登录' : '注册' }}
                    </span>
                </button>
            </form>
        </transition>

        <!-- 其他登录方式 -->
        <div class="mt-8">
            <div class="relative">
                <div class="absolute inset-0 flex items-center">
                    <div class="w-full border-t border-white/20"></div>
                </div>
                <div class="relative flex justify-center text-sm">
                    <span class="px-2 bg-slate-600 text-white/60">或使用以下方式</span>
                </div>
            </div>

            <div class="mt-6 grid grid-cols-2 gap-3">
                <button type="button" @click="handleQQLogin" :disabled="isQQLoading"
                    class="w-full inline-flex justify-center items-center py-2 px-4 border border-white/20 rounded-md shadow-sm bg-white/10 text-sm font-medium text-white hover:bg-white/20 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed">
                    <svg v-if="isQQLoading" class="animate-spin w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <t-icon v-else name="logo-qq" class="w-5 h-5" />
                    <span class="ml-2">{{ isQQLoading ? '跳转中...' : 'QQ 登录' }}</span>
                </button>

                <button type="button"
                    @click="MessagePlugin.warning('微信登录需要企业资质认证，个人开发者暂不支持。如需使用请申请微信开放平台企业账号。')"
                    class="w-full inline-flex justify-center items-center py-2 px-4 border border-white/20 rounded-md shadow-sm bg-white/10 text-sm font-medium text-white/50 cursor-not-allowed transition-all duration-300">
                    <t-icon name="logo-wechat-stroke" class="w-5 h-5 opacity-50" />
                    <span class="ml-2">微信（企业）</span>
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { MessagePlugin } from 'tdesign-vue-next';
import { ref, computed, watch, onMounted } from 'vue'

// 定义 emits
const emit = defineEmits<{
    'image-change': [imageKey: string]
    'form-submit': [data: any]
}>()

// 当前模式
const currentMode = ref<'login' | 'register'>('login')
const showPassword = ref(false)
const isSubmitting = ref(false)

// 表单数据
const loginForm = ref({
    username: '',
    password: '',
    remember: false
})

const registerForm = ref({
    username: '',
    password: '',
    confirmPassword: '',
    agreeTerms: false
})

// 表单验证
const isFormValid = computed(() => {
    if (currentMode.value === 'login') {
        return loginForm.value.username && loginForm.value.password
    } else {
        return (
            registerForm.value.username &&
            registerForm.value.password &&
            registerForm.value.confirmPassword &&
            registerForm.value.password === registerForm.value.confirmPassword &&
            registerForm.value.agreeTerms
        )
    }
})

// 切换模式
const switchMode = (mode: 'login' | 'register') => {
    currentMode.value = mode
    showPassword.value = false
}

// 处理表单提交
const handleSubmit = async () => {
    if (!isFormValid.value || isSubmitting.value) return

    isSubmitting.value = true

    try {
        // 根据当前模式调用不同的API
        let response;
        if (currentMode.value === 'login') {
            // 使用表单数据格式登录
            const formData = new FormData();
            formData.append('username', loginForm.value.username);
            formData.append('password', loginForm.value.password);

            response = await fetch('/api/login', {
                method: 'POST',
                body: formData
            });
        } else {
            // 使用表单数据格式注册
            const formData = new FormData();
            formData.append('email', registerForm.value.username);
            formData.append('password', registerForm.value.password);

            response = await fetch('/api/register/form', {
                method: 'POST',
                body: formData
            });
        }

        const result = await response.json();

        if (result.status === "success" || result.access_token) {
            // 成功处理
            const token = result.access_token || result.token;
            emit('form-submit', {
                type: currentMode.value,
                email: currentMode.value === 'login' ? loginForm.value.username : registerForm.value.username,
                password: currentMode.value === 'login' ? loginForm.value.password : registerForm.value.password,
                token: token
            });
        } else {
            alert(`${currentMode.value === 'login' ? '登录' : '注册'}失败: ${result.detail || '未知错误'}`);
        }

        // 重置表单
        if (currentMode.value === 'login') {
            loginForm.value = { username: '', password: '', remember: false }
        } else {
            registerForm.value = {
                username: '',
                password: '',
                confirmPassword: '',
                agreeTerms: false
            }
        }
    } catch (error) {
        console.error('提交失败:', error)
        alert('认证过程中发生错误，请稍后重试')
    } finally {
        isSubmitting.value = false
    }
}

// 忘记密码
const showForgotPassword = () => {
    alert('忘记密码功能待开发，请联系管理员')
}

// ─── QQ 登录 ───────────────────────────────────────────────────
const isQQLoading = ref(false)

const handleQQLogin = async () => {
    if (isQQLoading.value) return
    isQQLoading.value = true
    try {
        // 从后端获取 QQ 授权 URL
        const res = await fetch('/api/qq/authorize')
        const data = await res.json()
        if (data.authorize_url) {
            // 跳转到 QQ 授权页
            window.location.href = data.authorize_url
        } else {
            MessagePlugin.error('获取 QQ 授权链接失败，请稍后重试')
        }
    } catch (e) {
        MessagePlugin.error('网络错误，请稍后重试')
    } finally {
        isQQLoading.value = false
    }
}

// ─── 处理 OAuth 回调参数（QQ 回调后带 token 回来）────────────────
onMounted(() => {
    const params = new URLSearchParams(window.location.search)
    const oauthToken = params.get('oauth_token')
    const oauthType  = params.get('oauth_type')
    const oauthError = params.get('oauth_error')
    const nickname   = params.get('nickname') || ''

    if (oauthError) {
        MessagePlugin.error(`QQ 登录失败：${decodeURIComponent(oauthError)}`)
        // 清除 URL 参数
        window.history.replaceState({}, '', window.location.pathname)
        return
    }

    if (oauthToken && oauthType === 'qq') {
        // 存储 JWT，然后跳转
        localStorage.setItem('jwt', oauthToken)
        MessagePlugin.success(`QQ 登录成功${nickname ? '，欢迎 ' + decodeURIComponent(nickname) : ''}！`)
        // 触发父组件的 form-submit 事件
        emit('form-submit', {
            type: 'login',
            email: '',
            password: '',
            token: oauthToken,
        })
    }
})

// 监听模式变化，更新右侧图片
watch(currentMode, (newMode) => {
    emit('image-change', newMode)
}, { immediate: true })
</script>

<style scoped>
/* 表单切换动画 */
.form-slide-enter-active,
.form-slide-leave-active {
    transition: all 0.3s ease-in-out;
}

.form-slide-enter-from {
    opacity: 0;
    transform: translateX(20px);
}

.form-slide-leave-to {
    opacity: 0;
    transform: translateX(-20px);
}

/* 自定义滚动条 */
.scrollbar-hidden {
    scrollbar-width: none;
    -ms-overflow-style: none;
}

.scrollbar-hidden::-webkit-scrollbar {
    display: none;
}

/* 输入框动画效果 */
input:focus {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(34, 211, 238, 0.15);
}

/* 按钮悬停效果 */
button:not(:disabled):hover {
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
}

/* 复选框自定义样式 */
input[type="checkbox"] {
    width: 16px;
    height: 16px;
}
</style>