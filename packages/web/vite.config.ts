import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { PluginOption } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react(), tailwindcss() as unknown as PluginOption],
  server: {
    host: true,
    port: 3002,
    proxy: {
      // Proxy API + Better Auth calls to the local wrangler dev server during
      // development. Cookies set by the API land on this origin via the proxy.
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/auth": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
      // Cloudflare Agents (Durable Object WebSockets) live on the worker at
      // /agents/*. ws:true forwards the WebSocket upgrade through the proxy
      // so the SPA can stay same-origin in dev. Regex prefix is scoped to
      // `/agents/` so SPA routes like `/agents-test` aren't intercepted.
      "^/agents/": {
        target: "http://localhost:8787",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    port: 3002,
  },
});
