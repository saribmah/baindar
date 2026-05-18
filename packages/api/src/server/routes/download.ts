import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import type { AppEnv } from "../../app/context";
import { Download } from "../../download/download";
import { createErrorMapper } from "../error-mapper";

const downloadRouter = new Hono<AppEnv>();

downloadRouter.get(
  "/macos",
  describeRoute({
    summary: "Redirect to the latest macOS desktop release",
    description:
      "302 to the latest published Baindar desktop DMG on GitHub Releases. " +
      "Arch is picked from ?arch=arm64|intel, then from Sec-CH-UA-Arch, " +
      "defaulting to arm64. Used by the landing page download button.",
    operationId: "download.macos",
    responses: {
      302: { description: "Redirect to the DMG download URL" },
      404: { description: "No matching asset for the requested arch" },
      502: { description: "Upstream GitHub releases lookup failed" },
    },
  }),
  async (c) => {
    const mapError = createErrorMapper([
      { error: Download.AssetNotFoundError, status: 404 as const },
      { error: Download.NoReleaseError, status: 502 as const },
    ]);
    try {
      const arch = Download.detectArch(c.req.raw.headers, c.req.query("arch"));
      const url = await Download.resolveLatestMacAsset(arch);
      // Opt the client into the Chromium arch hint so future requests can
      // skip the arm64 default. Harmless on non-Chromium browsers.
      c.header("Accept-CH", "Sec-CH-UA-Arch");
      c.header("Vary", "Sec-CH-UA-Arch");
      return c.redirect(url, 302);
    } catch (error) {
      const mapped = mapError(error);
      if (!mapped) throw error;
      return c.json(mapped.payload, mapped.status);
    }
  },
);

export default downloadRouter;
