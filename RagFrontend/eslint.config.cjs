// RagFrontend/eslint.config.cjs
const js = require('@eslint/js')
const pluginVue = require('eslint-plugin-vue')
const tseslint = require('typescript-eslint')
const prettierConfig = require('eslint-config-prettier')
const prettierPlugin = require('eslint-plugin-prettier')

module.exports = [
  // 1. 全局忽略
  {
    ignores: [
      'dist/**',
      'dist-ssr/**',
      'node_modules/**',
      '*.config.*',
      'coverage/**',
      'public/**',
      'build/**'
    ]
  },

  // 2. 基础推荐规则
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // 3. Vue 3 flat config 规则
  ...pluginVue.configs['flat/recommended'],
  ...pluginVue.configs['flat/strongly-recommended'],

  // 4. .vue 文件特殊处理
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        sourceType: 'module',
        ecmaVersion: 'latest',
        extraFileExtensions: ['.vue']
      }
    }
  },

  // 5. 主要规则配置
  {
    files: ['**/*.{js,ts,vue,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      vue: pluginVue,
      prettier: prettierPlugin
    },
    rules: {
      // Vue 规则
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off',

      // TypeScript 规则
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-expressions': 'off',

      // 通用规则
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',

      // Prettier
      'prettier/prettier': 'error'
    }
  },

  // 6. Prettier 冲突规则关闭（必须放在最后）
  prettierConfig
]
