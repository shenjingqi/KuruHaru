import {
  defineConfig,
  presetUno,
  presetAttributify,
  presetIcons,
  transformerDirectives
} from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      cdn: 'https://esm.sh/'
    })
  ],
  transformers: [transformerDirectives()],
  theme: {
    colors: {
      purple: {
        DEFAULT: '#8b5cf6',
        light: '#a78bfa',
        dark: '#7c3aed',
        50: '#f5f3ff',
        100: '#ede9fe',
        200: '#ddd6fe',
        300: '#c4b5fd',
        400: '#a78bfa',
        500: '#8b5cf6',
        600: '#7c3aed',
        700: '#6d28d9',
        800: '#5b21b6',
        900: '#4c1d95'
      },
      neutral: {
        50: '#fafafa',
        100: '#f5f5f5',
        200: '#e5e5e5',
        300: '#d4d4d4',
        400: '#a3a3a3',
        500: '#737373',
        600: '#525252',
        700: '#404040',
        800: '#262626',
        900: '#171717'
      }
    }
  },
  shortcuts: {
    btn: 'px-4 py-2 rounded-lg cursor-pointer transition-all duration-200 font-medium',
    'btn-primary': 'btn bg-purple-500 text-white hover:bg-purple-400 active:bg-purple-600',
    'btn-secondary': 'btn bg-neutral-200 text-neutral-800 hover:bg-neutral-300',
    'btn-ghost': 'btn bg-transparent text-neutral-600 hover:bg-neutral-100',
    card: 'bg-white rounded-xl p-6 shadow-sm border border-neutral-100',
    input:
      'px-4 py-2.5 rounded-lg border border-neutral-200 bg-white outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all duration-200',
    badge: 'px-2.5 py-1 rounded-full text-xs font-medium',
    'page-container': 'h-full flex flex-col gap-6 p-8',
    'page-header': 'flex justify-between items-center',
    'page-title': 'm-0 text-2xl font-semibold text-neutral-800',
    'section-title': 'm-0 text-lg font-medium text-neutral-700 mb-4',
    label: 'block text-sm font-medium text-neutral-600 mb-1.5',
    'flex-center': 'flex items-center justify-center',
    'flex-between': 'flex justify-between items-center',
    divider: 'h-px bg-neutral-100 my-6',
    // Responsive utilities
    'responsive-container': 'w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
    'responsive-card':
      'bg-white rounded-xl shadow-sm border border-neutral-100 p-6 transition-all duration-300 hover:shadow-md',
    'responsive-grid':
      'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6',
    'responsive-flex': 'flex flex-col sm:flex-row gap-4',
    'responsive-flex-center': 'flex flex-col sm:flex-row items-center gap-4',
    'responsive-justify-between':
      'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4',
    // Anime theme colors
    'sakura-pink': '#ffb7b2',
    'sky-blue': '#aec6cf',
    lavender: '#c3b1e1',
    'mint-green': '#b2d8d8',
    // Glass effect
    'glass-effect': 'backdrop-blur-lg bg-white/80 border border-white/20'
  }
})
