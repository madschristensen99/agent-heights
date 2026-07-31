/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0a0b14",
          card: "#11131f",
          hover: "#1a1d2e",
          input: "#0d0f1a",
        },
        border: {
          DEFAULT: "#1e2235",
          hover: "#2a2f48",
        },
        accent: {
          DEFAULT: "#58c866",
          hover: "#3da64a",
        },
        muted: "#6b7280",
        status: {
          idle: "#6b7280",
          thinking: "#3a7cb5",
          working: "#58c866",
          done: "#53b86b",
          error: "#e05d5d",
          waiting: "#b0741f",
        },
      },
    },
  },
  plugins: [],
};
