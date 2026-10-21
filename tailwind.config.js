/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        blue: { 50: '#f0f4ff', 100: '#eaf0ff', 200: '#c8d7fb', 500: '#2459e0', 600: '#2459e0', 700: '#1947bb', 800: '#163d9e', 900: '#142b54' },
        slate: { 50: '#f4f7fc', 100: '#eaf0f7', 200: '#dce4ef', 400: '#8290a6', 500: '#65738b', 600: '#52627b', 700: '#354b6c', 800: '#142b54', 900: '#142b54' },
      },
      boxShadow: { sm: '0 2px 8px #142b5405', md: '0 4px 16px #142b5408', lg: '0 6px 24px #142b540a', xl: '0 8px 32px #142b540d', '2xl': '0 12px 40px #142b5412' },
      fontFamily: {
        alexandria: ['Alexandria', '"SF Arabic"', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', 'system-ui', 'sans-serif'],
        sf: ['Alexandria', '"SF Arabic"', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', 'system-ui', 'sans-serif'],
        sans: ['Alexandria', '"SF Arabic"', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
