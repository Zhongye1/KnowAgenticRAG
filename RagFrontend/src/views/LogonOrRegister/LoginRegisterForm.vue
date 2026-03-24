<template>
    <div class="w-full max-w-md mx-auto">
        <!-- 标签切换（找回密码模式时隐藏） -->
        <div v-if="currentMode !== 'forgot'" class="flex mb-8 bg-white/10 rounded-lg p-1">
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
        <!-- 找回密码顶部标题栏 -->
        <div v-else class="flex items-center mb-8">
            <button @click="backToLogin"
                class="flex items-center text-white/60 hover:text-white transition-colors mr-3">
                <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
                返回登录
            </button>
            <h2 class="text-xl font-light text-white">找回密码</h2>
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
                <div v-else-if="currentMode === 'register'">
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

                <!-- ── 找回密码表单 ───────────────────────────────────── -->
                <div v-else>
                    <!-- Step 1: 选择验证方式 + 输入账号 -->
                    <div v-if="forgotStep === 1" class="space-y-5">
                        <!-- 验证方式选择 -->
                        <div class="flex bg-white/10 rounded-lg p-1 mb-4">
                            <button type="button" @click="forgotMethod = 'email'" :class="[
                                'flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all duration-300',
                                forgotMethod === 'email'
                                    ? 'bg-cyan-400 text-white shadow-lg'
                                    : 'text-white/70 hover:text-white hover:bg-white/10'
                            ]">
                                📧 邮箱验证
                            </button>
                            <button type="button" @click="forgotMethod = 'phone'" :class="[
                                'flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all duration-300',
                                forgotMethod === 'phone'
                                    ? 'bg-cyan-400 text-white shadow-lg'
                                    : 'text-white/70 hover:text-white hover:bg-white/10'
                            ]">
                                📱 手机验证
                            </button>
                        </div>

                        <!-- 邮箱输入 -->
                        <div v-if="forgotMethod === 'email'">
                            <label class="block text-white/80 text-sm font-light mb-2">注册邮箱</label>
                            <input v-model="forgotForm.email" type="email" required
                                class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300"
                                placeholder="请输入注册时使用的邮箱" />
                            <p v-if="forgotEmailHint" :class="forgotEmailHint.type === 'error' ? 'text-red-400' : 'text-green-400'"
                                class="text-xs mt-1">{{ forgotEmailHint.msg }}</p>
                        </div>

                        <!-- 手机号输入 -->
                        <div v-if="forgotMethod === 'phone'">
                            <label class="block text-white/80 text-sm font-light mb-2">绑定手机号</label>
                            <input v-model="forgotForm.phone" type="tel" required
                                class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300"
                                placeholder="请输入绑定的手机号" />
                        </div>

                        <!-- 发送验证码按钮 -->
                        <button type="button" @click="sendVerifyCode"
                            :disabled="isSendingCode || countDown > 0 || !forgotStepOneReady"
                            class="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium rounded-lg shadow-lg hover:from-cyan-600 hover:to-blue-600 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-transparent transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]">
                            <span v-if="isSendingCode" class="flex items-center justify-center">
                                <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                发送中...
                            </span>
                            <span v-else-if="countDown > 0">{{ countDown }}s 后可重发</span>
                            <span v-else>发送验证码</span>
                        </button>
                    </div>

                    <!-- Step 2: 输入验证码 + 新密码 -->
                    <div v-else-if="forgotStep === 2" class="space-y-5">
                        <p class="text-white/60 text-sm text-center">
                            验证码已发送至
                            <span class="text-cyan-400">{{ forgotMethod === 'email' ? forgotForm.email : forgotForm.phone }}</span>
                        </p>

                        <!-- 验证码 -->
                        <div>
                            <label class="block text-white/80 text-sm font-light mb-2">验证码</label>
                            <div class="flex gap-2">
                                <input v-model="forgotForm.code"
                                    type="text" maxlength="6"
                                    class="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 tracking-widest text-center text-lg"
                                    placeholder="6 位验证码" />
                                <button type="button" @click="sendVerifyCode"
                                    :disabled="isSendingCode || countDown > 0"
                                    class="px-3 py-2 bg-white/10 border border-white/20 text-white/70 text-xs rounded-lg hover:bg-white/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
                                    {{ countDown > 0 ? `${countDown}s` : '重新发送' }}
                                </button>
                            </div>
                        </div>

                        <!-- 新密码 -->
                        <div>
                            <label class="block text-white/80 text-sm font-light mb-2">新密码</label>
                            <div class="relative">
                                <input v-model="forgotForm.newPassword" :type="showNewPassword ? 'text' : 'password'"
                                    class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300"
                                    placeholder="请输入新密码（至少 6 位）" />
                                <button type="button" @click="showNewPassword = !showNewPassword"
                                    class="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/60 hover:text-white transition-colors">
                                    <svg v-if="showNewPassword" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                                    </svg>
                                    <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <!-- 确认新密码 -->
                        <div>
                            <label class="block text-white/80 text-sm font-light mb-2">确认新密码</label>
                            <input v-model="forgotForm.confirmPassword" :type="showNewPassword ? 'text' : 'password'"
                                class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300"
                                :class="{ 'border-red-400': forgotForm.newPassword && forgotForm.confirmPassword && forgotForm.newPassword !== forgotForm.confirmPassword }"
                                placeholder="请再次输入新密码" />
                            <p v-if="forgotForm.newPassword && forgotForm.confirmPassword && forgotForm.newPassword !== forgotForm.confirmPassword"
                                class="text-red-400 text-xs mt-1">两次密码不一致</p>
                        </div>
                    </div>

                    <!-- Step 3: 重置成功 -->
                    <div v-else-if="forgotStep === 3" class="text-center py-6 space-y-4">
                        <div class="w-16 h-16 bg-green-400/20 rounded-full flex items-center justify-center mx-auto">
                            <svg class="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                            </svg>
                        </div>
                        <p class="text-white text-lg font-light">密码重置成功！</p>
                        <p class="text-white/60 text-sm">请使用新密码重新登录</p>
                        <button type="button" @click="backToLogin"
                            class="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium rounded-lg shadow-lg hover:from-cyan-600 hover:to-blue-600 transition-all duration-300 transform hover:scale-[1.02]">
                            返回登录
                        </button>
                    </div>
                </div>

                <!-- 提交按钮（找回密码 Step2 时显示，Step3 成功页不显示） -->
                <button v-if="currentMode !== 'forgot' || forgotStep === 2"
                    type="submit" :disabled="isSubmitting || !isFormValid"
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
                        {{ currentMode === 'login' ? '登录中...' : currentMode === 'register' ? '注册中...' : '重置中...' }}
                    </span>
                    <span v-else>
                        {{ currentMode === 'login' ? '登录' : currentMode === 'register' ? '注册' : '确认重置密码' }}
                    </span>
                </button>
            </form>
        </transition>

        <!-- 其他登录方式（找回密码模式下隐藏） -->
        <div v-if="currentMode !== 'forgot'" class="mt-8">
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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

// 定义 emits
const emit = defineEmits<{
    'image-change': [imageKey: string]
    'form-submit': [data: any]
}>()

// 当前模式
const currentMode = ref<'login' | 'register' | 'forgot'>('login')
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

// ─────────────────────────────
// 找回密码状态
// ─────────────────────────────
const forgotStep   = ref<1 | 2 | 3>(1)   // 1=填账号 2=填验证码+新密码 3=成功
const forgotMethod = ref<'email' | 'phone'>('email')
const showNewPassword = ref(false)
const isSendingCode  = ref(false)
const countDown      = ref(0)
let   countDownTimer: ReturnType<typeof setInterval> | null = null

const forgotForm = ref({
    email:           '',
    phone:           '',
    code:            '',
    newPassword:     '',
    confirmPassword: ''
})

// 邮箱格式提示
const forgotEmailHint = ref<{ type: 'error' | 'ok'; msg: string } | null>(null)

const forgotStepOneReady = computed(() => {
    if (forgotMethod.value === 'email') {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotForm.value.email)
    }
    return /^1[3-9]\d{9}$/.test(forgotForm.value.phone)
})

// 发送验证码
const sendVerifyCode = async () => {
    if (isSendingCode.value || countDown.value > 0) return
    isSendingCode.value = true
    try {
        const target = forgotMethod.value === 'email'
            ? forgotForm.value.email.trim().toLowerCase()
            : forgotForm.value.phone.trim()

        const apiPath = forgotMethod.value === 'email'
            ? '/api/reset/send-email-code'
            : '/api/reset/send-sms-code'

        const body = forgotMethod.value === 'email'
            ? { email: target }
            : { phone: target }

        const res = await fetch(apiPath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        const data = await res.json()

        if (res.ok && data.status === 'success') {
            MessagePlugin.success('验证码已发送，请查收')
            forgotStep.value = 2
            startCountDown()
        } else {
            MessagePlugin.error(data.detail || '发送失败，请稍后重试')
        }
    } catch (e) {
        MessagePlugin.error('网络错误，请稍后重试')
    } finally {
        isSendingCode.value = false
    }
}

// 倒计时
const startCountDown = () => {
    countDown.value = 60
    if (countDownTimer) clearInterval(countDownTimer)
    countDownTimer = setInterval(() => {
        countDown.value--
        if (countDown.value <= 0) {
            clearInterval(countDownTimer!)
            countDownTimer = null
        }
    }, 1000)
}

// 重置找回密码表单
const resetForgotForm = () => {
    forgotStep.value   = 1
    forgotMethod.value = 'email'
    forgotForm.value   = { email: '', phone: '', code: '', newPassword: '', confirmPassword: '' }
    forgotEmailHint.value = null
    countDown.value = 0
    showNewPassword.value = false
    if (countDownTimer) { clearInterval(countDownTimer); countDownTimer = null }
}

// 表单验证
const isFormValid = computed(() => {
    if (currentMode.value === 'login') {
        return loginForm.value.username && loginForm.value.password
    } else if (currentMode.value === 'register') {
        return (
            registerForm.value.username &&
            registerForm.value.password &&
            registerForm.value.confirmPassword &&
            registerForm.value.password === registerForm.value.confirmPassword &&
            registerForm.value.agreeTerms
        )
    } else {
        // forgot step2
        return (
            forgotForm.value.code.length === 6 &&
            forgotForm.value.newPassword.length >= 6 &&
            forgotForm.value.newPassword === forgotForm.value.confirmPassword
        )
    }
})

// 切换模式
const switchMode = (mode: 'login' | 'register') => {
    currentMode.value = mode
    showPassword.value = false
    resetForgotForm()
}

const backToLogin = () => {
    currentMode.value = 'login'
    resetForgotForm()
    emit('image-change', 'login')
}

// 处理表单提交
const handleSubmit = async () => {
    if (!isFormValid.value || isSubmitting.value) return
    isSubmitting.value = true

    try {
        // ── 找回密码提交（Step 2 → 重置密码）──────────────────────
        if (currentMode.value === 'forgot') {
            const res = await fetch('/api/reset/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    method:           forgotMethod.value,
                    target:           forgotMethod.value === 'email'
                                        ? forgotForm.value.email.trim().toLowerCase()
                                        : forgotForm.value.phone.trim(),
                    code:             forgotForm.value.code.trim(),
                    new_password:     forgotForm.value.newPassword,
                    confirm_password: forgotForm.value.confirmPassword
                })
            })
            const data = await res.json()
            if (res.ok && data.status === 'success') {
                forgotStep.value = 3
                emit('image-change', 'success')
            } else {
                MessagePlugin.error(data.detail || '重置失败，请检查验证码')
            }
            return
        }

        // ── 登录 / 注册 ───────────────────────────────────────────
        let response;
        if (currentMode.value === 'login') {
            const formData = new FormData();
            formData.append('username', loginForm.value.username);
            formData.append('password', loginForm.value.password);
            response = await fetch('/api/login', { method: 'POST', body: formData });
        } else {
            const formData = new FormData();
            formData.append('email', registerForm.value.username);
            formData.append('password', registerForm.value.password);
            response = await fetch('/api/register/form', { method: 'POST', body: formData });
        }

        const result = await response.json();

        if (result.status === "success" || result.access_token) {
            const token = result.access_token || result.token;
            emit('form-submit', {
                type: currentMode.value,
                email: currentMode.value === 'login' ? loginForm.value.username : registerForm.value.username,
                password: currentMode.value === 'login' ? loginForm.value.password : registerForm.value.password,
                token
            });
        } else {
            alert(`${currentMode.value === 'login' ? '登录' : '注册'}失败: ${result.detail || '未知错误'}`);
        }

        if (currentMode.value === 'login') {
            loginForm.value = { username: '', password: '', remember: false }
        } else {
            registerForm.value = { username: '', password: '', confirmPassword: '', agreeTerms: false }
        }

    } catch (error) {
        console.error('提交失败:', error)
        alert('认证过程中发生错误，请稍后重试')
    } finally {
        isSubmitting.value = false
    }
}

// 忘记密码入口
const showForgotPassword = () => {
    currentMode.value = 'forgot'
    resetForgotForm()
    emit('image-change', 'forgot')
}

// ─── QQ 登录 ───────────────────────────────────────────────────
const isQQLoading = ref(false)

const handleQQLogin = async () => {
    if (isQQLoading.value) return
    isQQLoading.value = true
    try {
        const res  = await fetch('/api/qq/authorize')
        const data = await res.json()
        if (data.authorize_url) {
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

// ─── 处理 OAuth 回调参数 ─────────────────────────────────────
onMounted(() => {
    const params     = new URLSearchParams(window.location.search)
    const oauthToken = params.get('oauth_token')
    const oauthType  = params.get('oauth_type')
    const oauthError = params.get('oauth_error')
    const nickname   = params.get('nickname') || ''

    if (oauthError) {
        MessagePlugin.error(`QQ 登录失败：${decodeURIComponent(oauthError)}`)
        window.history.replaceState({}, '', window.location.pathname)
        return
    }

    if (oauthToken && oauthType === 'qq') {
        localStorage.setItem('jwt', oauthToken)
        MessagePlugin.success(`QQ 登录成功${nickname ? '，欢迎 ' + decodeURIComponent(nickname) : ''}！`)
        emit('form-submit', { type: 'login', email: '', password: '', token: oauthToken })
    }
})

onUnmounted(() => {
    if (countDownTimer) clearInterval(countDownTimer)
})

// 监听模式变化，更新右侧图片
watch(currentMode, (newMode) => {
    if (newMode !== 'forgot') emit('image-change', newMode)
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