import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { PluginOption } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Vite owns the view build for desktop. In dev it serves the React app on
// :3003 with full HMR; the Bun main process loads that URL into the
// BrowserWindow. In prod, `vite build` outputs static assets to dist-view/,
// which Electrobun copies into the .app bundle as views://mainview/ (see
// electrobun.config.ts).
export default defineConfig({
  root: resolve(__dirname, "src/views/mainview"),
  // `envDir` defaults to `root`, which would make Vite look for env files
  // under src/views/mainview/. `.env.development` and `.env.production`
  // live at the package root — point Vite there so VITE_API_URL /
  // VITE_AUTH_URL get inlined into the bundle.
  envDir: __dirname,
  plugins: [tsconfigPaths(), react(), tailwindcss() as unknown as PluginOption],
  base: "./",
  build: {
    outDir: resolve(__dirname, "dist-view"),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    host: true,
    port: 3003,
    strictPort: true,
  },
  preview: {
    port: 3003,
  },
});
