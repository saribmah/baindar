import { z } from "zod";
import { NamedError } from "../utils/error";

// Resolves the latest desktop DMG URL from GitHub Releases. The release
// workflow uploads `Baindar-<semver>-arm64.dmg` and `Baindar-<semver>-intel.dmg`
// to a tag named `desktop-v<semver>`; we look up the asset by arch suffix so
// the version doesn't need to be plumbed through the landing page.
export namespace Download {
  export const Arch = z.enum(["arm64", "intel"]);
  export type Arch = z.infer<typeof Arch>;

  export const NoReleaseError = NamedError.create(
    "DownloadNoReleaseError",
    z.object({ status: z.number().optional(), message: z.string().optional() }),
  );
  export type NoReleaseError = InstanceType<typeof NoReleaseError>;

  export const AssetNotFoundError = NamedError.create(
    "DownloadAssetNotFoundError",
    z.object({ arch: Arch, message: z.string().optional() }),
  );
  export type AssetNotFoundError = InstanceType<typeof AssetNotFoundError>;

  const RELEASES_URL = "https://api.github.com/repos/saribmah/baindar/releases/latest";

  type GitHubAsset = { name: string; browser_download_url: string };
  type GitHubRelease = { assets: GitHubAsset[] };

  export const resolveLatestMacAsset = async (arch: Arch): Promise<string> => {
    const response = await fetch(RELEASES_URL, {
      headers: {
        "User-Agent": "Baindar-Download-Redirect",
        Accept: "application/vnd.github+json",
      },
      // Cache the release lookup at Cloudflare's edge for 5 min. New releases
      // happen rarely; the cache cuts both latency and GitHub API rate-limit
      // pressure (Cloudflare egress IPs are shared across many customers).
      cf: { cacheTtl: 300, cacheEverything: true },
    } as RequestInit);

    if (!response.ok) {
      throw new NoReleaseError({
        status: response.status,
        message: `GitHub releases lookup failed: ${response.status}`,
      });
    }

    const release = (await response.json()) as GitHubRelease;
    const suffix = `-${arch}.dmg`;
    const asset = release.assets.find((a) => a.name.endsWith(suffix));
    if (!asset) {
      throw new AssetNotFoundError({
        arch,
        message: `No release asset ending in ${suffix}`,
      });
    }
    return asset.browser_download_url;
  };

  // Picks an arch from request hints. Order: explicit ?arch=, then the
  // Chromium Client Hint `Sec-CH-UA-Arch` (sent only after the landing
  // page opts in via Accept-CH on a prior response), then default arm64.
  // Apple has shipped arm64-only Macs since late 2020, so arm64 is the
  // sensible default; Intel users still get there via the explicit query.
  export const detectArch = (headers: Headers, queryArch: string | undefined): Arch => {
    const parsed = queryArch ? Arch.safeParse(queryArch) : null;
    if (parsed?.success) return parsed.data;

    const archHint = headers.get("sec-ch-ua-arch")?.replaceAll('"', "");
    if (archHint === "arm") return "arm64";
    if (archHint === "x86") return "intel";

    return "arm64";
  };
}
