/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      boxShadow: {
        'dark-lg': '0 10px 20px green', // Zyada dark shadow
      },
    },
  },
  plugins: [],
}

