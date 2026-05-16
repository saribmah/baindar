// Runs Vite (view) and Electrobun (main process + webview) together for dev.
// Vite serves the React app at :3003 with HMR; Electrobun's BrowserWindow
// loads http://localhost:3003 when NODE_ENV=development (see src/main/index.ts).
export {};

// BAINDAR_DESKTOP_DEV is what src/main/index.ts keys off to decide between
// http://localhost:3003 (HMR) and views://mainview/index.html (bundled). It
// is *not* NODE_ENV — Bun's bundler inlines NODE_ENV at build time, so
// using it here would silently bake "dev" into release .apps. NODE_ENV is
// also set so Vite + React pick up the development build.
const env = {
  ...process.env,
  NODE_ENV: "development",
  BAINDAR_DESKTOP_DEV: "1",
};

const vite = Bun.spawn(["bunx", "--bun", "vite"], {
  stdio: ["inherit", "inherit", "inherit"],
  env,
});

const electrobun = Bun.spawn(["bunx", "electrobun", "dev"], {
  stdio: ["inherit", "inherit", "inherit"],
  env,
});

const cleanup = () => {
  if (!vite.killed) vite.kill();
  if (!electrobun.killed) electrobun.kill();
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

const exitCode = await Promise.race([vite.exited, electrobun.exited]);
cleanup();
process.exit(exitCode ?? 0);
