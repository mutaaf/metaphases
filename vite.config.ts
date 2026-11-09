import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { CSP } from "./shared/csp";
export default defineConfig({
  base: "/metaphases/",
  build: { outDir: "dist/metaphases", emptyOutDir: true },
  plugins: [react()],
  // 0036: preview (the e2e server) serves the production CSP, so every e2e test runs the app under it.
  preview: { headers: { "Content-Security-Policy": CSP } },
  server: { port: 5188, proxy: { "/metaphases/api": "http://localhost:8811" } },
});
