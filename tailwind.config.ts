import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0d1726",
        paper: "#f8fafc",
        accent: "#10b981",
        accentDark: "#047857",
        warn: "#d97706",
        danger: "#dc2626",
        night: "#081525",
        mist: "#eef4f7",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        panel: "0 1px 2px rgba(8, 21, 37, 0.05), 0 12px 36px rgba(8, 21, 37, 0.08)",
        float: "0 18px 55px rgba(8, 21, 37, 0.16)",
        glow: "0 10px 28px rgba(16, 185, 129, 0.26)",
      },
    },
  },
  plugins: [],
};

export default config;
