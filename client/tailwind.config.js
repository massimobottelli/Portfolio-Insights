/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0b0e13',
          900: '#10141b',
          800: '#161b24',
          700: '#1e2530',
          600: '#2a3140',
        },
        gold: {
          400: '#d4a24a',
          500: '#c08c35',
        },
        bull: '#2fbf8f',
        bear: '#e0564f',
        paper: '#e8e6e1',
        muted: '#8b93a3',
      },
      fontFamily: {
        display: ['"Fraunces"', '"Playfair Display"', 'serif'],
        sans: ['"IBM Plex Sans"', '"IBM Plex"', 'system-ui', 'sans-serif'],
        num: ['"IBM Plex Mono"', '"IBM Plex"', '"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};