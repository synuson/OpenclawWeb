import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "tailwindcss";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const config: Config = {
  content: [
    path.join(dirname, "app/**/*.{js,ts,jsx,tsx,mdx}"),
    path.join(dirname, "../../packages/shared/src/components/**/*.{js,ts,jsx,tsx,mdx}"),
    path.join(dirname, "../../packages/shared/src/lib/**/*.{js,ts,jsx,tsx,mdx}")
  ],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--ink) / <alpha-value>)",
        paper: "rgb(var(--paper) / <alpha-value>)",
        panel: "rgb(var(--panel) / <alpha-value>)",
        cobalt: "rgb(var(--cobalt) / <alpha-value>)",
        mint: "rgb(var(--mint) / <alpha-value>)",
        ember: "rgb(var(--ember) / <alpha-value>)",
        rose: "rgb(var(--rose) / <alpha-value>)",
        mist: "rgb(var(--mist) / <alpha-value>)"
      },
      boxShadow: {
        panel: "0 18px 60px rgba(24, 33, 51, 0.12)",
        glow: "0 0 0 1px rgba(255,255,255,0.45), 0 24px 80px rgba(27, 48, 98, 0.22)"
      }
    }
  },
  plugins: []
};

export default config;
