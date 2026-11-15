/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // KneadOS platform palette: ink + teal. Shop sites bring their own brand color.
        ink: { 950: '#070b14', 900: '#0b1220', 800: '#111a2e', 700: '#1b2740', 600: '#2a3957' },
        glaze: { 50: '#effdfa', 100: '#ccfbf1', 300: '#5eead4', 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e' },
        // Demo shop brand ("pink box" donut shop).
        box: { 50: '#fff1f6', 100: '#ffe0eb', 200: '#ffc2d8', 400: '#fb6f9f', 500: '#f0457f', 600: '#d92b68', 700: '#b41d53' },
      },
    },
  },
  plugins: [],
};
