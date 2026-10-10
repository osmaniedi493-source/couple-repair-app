import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2430",
        paper: "#fff8ef",
        cream: "#fffdf7",
        peach: "#ffd8c6",
        rose: "#d9546f",
        moss: "#78906d",
        sky: "#8eb9df"
      },
      boxShadow: {
        sticker: "7px 7px 0 rgba(31, 36, 48, 0.12)",
        soft: "0 20px 55px rgba(31, 36, 48, 0.10)"
      }
    }
  },
  plugins: []
};

export default config;
