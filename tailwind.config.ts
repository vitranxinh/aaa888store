import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        border: "#e5e7eb",
        input: "#e5e7eb",
        ring: "#0f766e",
        background: "#f5f7fb",
        foreground: "#0f172a",
        primary: {
          DEFAULT: "#0f766e",
          foreground: "#ffffff"
        },
        secondary: {
          DEFAULT: "#eef2ff",
          foreground: "#1e293b"
        },
        muted: {
          DEFAULT: "#f8fafc",
          foreground: "#64748b"
        },
        accent: {
          DEFAULT: "#ecfeff",
          foreground: "#155e75"
        },
        card: {
          DEFAULT: "#ffffff",
          foreground: "#0f172a"
        },
        destructive: {
          DEFAULT: "#dc2626",
          foreground: "#ffffff"
        },
        success: "#15803d",
        warning: "#d97706"
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem"
      },
      boxShadow: {
        soft: "0 10px 30px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
