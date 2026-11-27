import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { CSP } from "./shared/csp";
import type { Plugin } from "vite";

// 0073: the client bundles data/universe.json whole, so fields only the worker and scripts read stay out of it:
// the listing-currency cap (mcL, mcCur, fx, fxAt; 0042) and the close each cap was taken at (px, mcAt).
export const WORKER_ONLY_UNIVERSE_FIELDS = ["mcL", "mcCur", "fx", "fxAt", "px", "mcAt"];
export function slimUniverse(): Plugin {
  return {
    name: "slim-universe",
    enforce: "pre",
    transform(code, id) {
      if (!/[\\/]data[\\/]universe\.json$/.test(id.split("?")[0])) return null;
      const u = JSON.parse(code) as Record<string, Record<string, unknown>>;
      for (const c of Object.values(u)) for (const k of WORKER_ONLY_UNIVERSE_FIELDS) delete c[k];
      return { code: JSON.stringify(u), map: null };
    },
  };
}
export default defineConfig({
  base: "/metaphases/",
  build: { outDir: "dist/metaphases", emptyOutDir: true },
  plugins: [slimUniverse(), react()],
  // 0036: preview (the e2e server) serves the production CSP, so every e2e test runs the app under it.
  preview: { headers: { "Content-Security-Policy": CSP } },
  server: { port: 5188, proxy: { "/metaphases/api": "http://localhost:8811" } },
});
