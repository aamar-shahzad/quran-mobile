/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html'],
  safelist: [
    { pattern: /^ph(-fill)?$/ },
    { pattern: /^ph-/ },
    { pattern: /^tajweed-/ },
    'playing-verse',
    'azkar-tab',
    'reader-advanced-controls',
    'is-collapsed',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          900: '#064e3b',
        },
        dark: {
          bg: '#0f172a',
          card: '#1e293b',
          border: '#334155',
        },
      },
      fontFamily: {
        amiri: ['Amiri', 'serif'],
        nastaliq: ['Noto Nastaliq Urdu', 'Amiri', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
