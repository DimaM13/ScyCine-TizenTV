/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cinema: {
          950: '#07090e',
          900: '#0d111a',
          850: '#141a29',
          800: '#1e2638',
          700: '#2b364e',
          gold: '#e5a93c',
          'gold-bright': '#f5c060',
          'gold-hover': '#d4962b',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'gold-glow': '0 0 25px -3px rgba(229, 169, 60, 0.45), 0 0 10px -2px rgba(229, 169, 60, 0.3)',
        'gold-glow-lg': '0 0 40px -5px rgba(229, 169, 60, 0.6), 0 0 15px -2px rgba(229, 169, 60, 0.4)',
      }
    },
  },
  plugins: [],
}
