import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "/metaphases/",
  build: { outDir: "dist/metaphases", emptyOutDir: true },
  plugins: [react()],
  server: { port: 5188, proxy: { "/metaphases/api": "http://localhost:8811" } },
});
