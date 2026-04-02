import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // theindex.website inspired palette
        cream: {
          DEFAULT: "#ffffff",
          dark: "#fafafa",
        },
        charcoal: {
          DEFAULT: "#222222",
          light: "#333333",
        },
        stone: {
          DEFAULT: "#666666",
          light: "#999999",
          border: "#e0e0e0",
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        serif: [
          'Georgia',
          'Times',
          '"Times New Roman"',
          'serif',
        ],
      },
    },
  },
  plugins: [],
};
export default config;
