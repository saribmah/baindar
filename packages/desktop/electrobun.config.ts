// Electrobun config. Vite is the view bundler — `bun run build:view` writes to
// dist-view/, then `electrobun build` copies that directory into the bundle as
// views://mainview/. The Bun main process is bundled by Electrobun itself
// (entrypoint below).
export default {
  app: {
    name: "Baindar",
    identifier: "app.baindar.desktop",
    // macOS-only deep-link scheme. Used by the Better Auth OAuth callback.
    // Add `baindar-desktop://` to the API's TRUSTED_ORIGINS so the redirect
    // is accepted.
    urlSchemes: ["baindar-desktop"],
  },
  build: {
    bun: {
      entrypoint: "src/main/index.ts",
    },
    // Files/dirs copied into the bundle under Contents/Resources/app. The
    // destination "views/mainview" becomes the views://mainview/ path the
    // main process loads in production (see src/main/index.ts). Electrobun
    // reads this from `build.copy` — putting it at the top level is silently
    // ignored and ships an .app with no view assets.
    copy: {
      "dist-view": "views/mainview",
    },
    mac: {
      codesign: false,
      notarize: false,
      // Path (relative to packages/desktop/) to the macOS .iconset folder.
      // Electrobun runs `iconutil -c icns` on it during build and emits
      // Contents/Resources/AppIcon.icns, which Info.plist's CFBundleIconFile
      // points at. Without this, macOS falls back to the generic white box
      // in Dock / Finder.
      icons: "assets/AppIcon.iconset",
    },
  },
};
