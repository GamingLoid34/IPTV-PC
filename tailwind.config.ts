import type { Config } from "tailwindcss";

/**
 * Tailwind v4: PostCSS + CSS-first setup (see src/styles/globals.css).
 * This file exists for tooling and project conventions (@/*, TS).
 */
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
};

export default config;
