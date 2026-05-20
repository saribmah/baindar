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
      // Signing + notarization run only when `electrobun build` is invoked
      // with --env=stable (or --env=canary). The `build:release` script
      // passes that flag; the plain `build` script stays as a fast unsigned
      // local build. Required env vars when --env=stable:
      //   ELECTROBUN_DEVELOPER_ID       — cert Common Name, e.g.
      //     "Developer ID Application: <Your Name> (<TEAMID>)"
      //   ELECTROBUN_APPLEAPIISSUER     — App Store Connect API Issuer ID (UUID)
      //   ELECTROBUN_APPLEAPIKEY        — App Store Connect API Key ID (10 chars)
      //   ELECTROBUN_APPLEAPIKEYPATH    — absolute path to AuthKey_<KEYID>.p8
      codesign: true,
      notarize: true,
      // Hardened runtime is required for notarization. These entitlements are
      // intentionally minimal — JIT is needed for the embedded JS runtime in
      // CEF and for Bun's main process. Add network/audio/etc. only when a
      // feature actually requires it.
      entitlements: {
        "com.apple.security.cs.allow-jit": true,
        "com.apple.security.cs.allow-unsigned-executable-memory": true,
        "com.apple.security.cs.disable-library-validation": true,
      },
      // Path (relative to packages/desktop/) to the macOS .iconset folder.
      // Electrobun runs `iconutil -c icns` on it during build and emits
      // Contents/Resources/AppIcon.icns, which Info.plist's CFBundleIconFile
      // points at. Without this, macOS falls back to the generic white box
      // in Dock / Finder.
      icons: "assets/AppIcon.iconset",
    },
  },
};
