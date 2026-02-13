/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 🌸 二次元粉色主题色系 - Sakura Pink
        'sakura-pink': {
          50: '#fef2f7',
          100: '#fce7f0',
          200: '#fad1e4',
          300: '#f8b3d1',
          400: '#f176aa',
          500: '#ff9eb5', // 主色
          600: '#d91e7a',
          700: '#b91d68',
          800: '#991b55',
          900: '#7c1845'
        },
        // 💙 二次元蓝紫色系 - Sky Blue
        'sky-blue': {
          50: '#f0f4ff',
          100: '#e0e9ff',
          200: '#c7d8fe',
          300: '#a5b9fc',
          400: '#8193f5',
          500: '#a0cfff', // 主色
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81'
        },
        // 💜 紫色系 - Lavender
        lavender: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#d4a5ff', // 主色
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95'
        },
        // 🍃 薄荷绿 - Mint Green
        'mint-green': {
          50: '#d4f1e9',
          100: '#a8e6cf',
          500: '#5eead4',
          900: '#0d9488'
        },
        // 🍑 暖橙色 - Peach
        peach: {
          50: '#fff7ed',
          100: '#ffedd5',
          500: '#ffdac1',
          900: '#c2410c'
        },
        // 玻璃材质相关
        glass: {
          100: 'rgba(255, 255, 255, 0.1)',
          200: 'rgba(255, 255, 255, 0.2)',
          300: 'rgba(255, 255, 255, 0.3)',
          400: 'rgba(255, 255, 255, 0.4)',
          500: 'rgba(255, 255, 255, 0.5)',
          600: 'rgba(255, 255, 255, 0.6)',
          700: 'rgba(255, 255, 255, 0.7)',
          800: 'rgba(255, 255, 255, 0.8)',
          900: 'rgba(255, 255, 255, 0.9)'
        },
        // 暗色主题背景
        dark: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0a0a0a'
        }
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'anime-bg': 'url("./assets/anime-bg.jpg")',
        sakura:
          'url("data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%23ff9eb5" fill-opacity="0.1"%3E%3Ccircle cx="30" cy="30" r="4"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
        'anime-primary': 'linear-gradient(135deg, #ff9eb5 0%, #d4a5ff 50%, #a0cfff 100%)',
        'anime-bg-glow':
          'linear-gradient(135deg, rgba(255, 158, 181, 0.3) 0%, rgba(160, 207, 255, 0.3) 50%, rgba(212, 165, 255, 0.3) 100%)'
      },
      animation: {
        'bounce-slow': 'bounce 2s infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        float: 'float 3s ease-in-out infinite',
        glow: 'glow 2s ease-in-out infinite alternate',
        'sakura-fall': 'sakura-fall 10s linear infinite',
        'page-enter': 'page-enter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'page-leave': 'page-leave 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'fade-up': 'fade-up 0.5s ease-out',
        'scale-in': 'scale-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' }
        },
        glow: {
          from: { boxShadow: '0 0 5px #ff9eb5, 0 0 10px #ff9eb5, 0 0 15px #ff9eb5' },
          to: { boxShadow: '0 0 10px #ff9eb5, 0 0 20px #ff9eb5, 0 0 30px #ff9eb5' }
        },
        'sakura-fall': {
          '0%': { transform: 'translateY(-100vh) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(100vh) rotate(360deg)', opacity: '0' }
        },
        'page-enter': {
          '0%': { transform: 'translateX(30px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' }
        },
        'page-leave': {
          '0%': { transform: 'translateX(0)', opacity: '1' },
          '100%': { transform: 'translateX(-30px)', opacity: '0' }
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        }
      },
      backdropBlur: {
        xs: '2px'
      },
      boxShadow: {
        glass: '0 8px 32px rgba(31, 38, 135, 0.37)',
        'glass-sm': '0 4px 16px rgba(31, 38, 135, 0.2)',
        anime: '0 0 20px rgba(255, 158, 181, 0.3)',
        'anime-hover': '0 10px 30px rgba(255, 158, 181, 0.5)',
        'neon-pink': '0 0 5px #ff9eb5, 0 0 10px #ff9eb5, 0 0 15px #ff9eb5, 0 0 20px #ff9eb5',
        'neon-blue': '0 0 5px #a0cfff, 0 0 10px #a0cfff, 0 0 15px #a0cfff, 0 0 20px #a0cfff',
        'neon-purple': '0 0 5px #d4a5ff, 0 0 10px #d4a5ff, 0 0 15px #d4a5ff, 0 0 20px #d4a5ff'
      },
      fontFamily: {
        anime: ['"Nunito"', '"Segoe UI"', 'sans-serif'],
        display: ['"Quicksand"', '"Segoe UI"', 'sans-serif']
      }
    }
  },
  plugins: [require('@tailwindcss/typography')]
}
