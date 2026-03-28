/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // 定义关键帧：0% 透明 → 100% 不透明
      keyframes: {
        'fade-in': {
          '0%': { opacity: 0 }, // 初始状态：透明且向下偏移
          '100%': { opacity: 1 } // 结束状态：不透明且回到原位
        }
      },
      // 将动画绑定到类名 `animate-fade-in`
      animation: {
        'fade-in': 'fade-in 0.3s ease-out forwards' // 缓动函数，保持最终状态
      }
    }
  },
  plugins: []
}
