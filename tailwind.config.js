/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        letusBg: '#f5f7fa',
        letusSidebar: '#273444',
        letusBlue: '#4b89ff',
        letusOrange: '#f58220',
      },
      fontFamily: {
        sans: ['Pretendard', '-apple-system', 'sans-serif']
      }
    },
  },
  plugins: [],
}
