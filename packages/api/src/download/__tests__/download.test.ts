import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Download } from "../download";

describe("Download.detectArch", () => {
  const empty = new Headers();

  it("prefers ?arch when valid", () => {
    expect(Download.detectArch(empty, "intel")).toBe("intel");
    expect(Download.detectArch(empty, "arm64")).toBe("arm64");
  });

  it("ignores invalid ?arch values", () => {
    expect(Download.detectArch(empty, "wat")).toBe("arm64");
  });

  it("reads Sec-CH-UA-Arch when no query is given", () => {
    const h = new Headers({ "sec-ch-ua-arch": '"x86"' });
    expect(Download.detectArch(h, undefined)).toBe("intel");
  });

  it("defaults to arm64", () => {
    expect(Download.detectArch(empty, undefined)).toBe("arm64");
  });
});

describe("Download.resolveLatestMacAsset", () => {
  const originalFetch = globalThis.fetch;

  const stubFetch = (impl: () => Promise<Response>) => {
    globalThis.fetch = mock(impl) as unknown as typeof fetch;
  };

  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the asset URL matching the arch suffix", async () => {
    stubFetch(
      async () =>
        new Response(
          JSON.stringify({
            assets: [
              {
                name: "Baindar-0.1.0-arm64.dmg",
                browser_download_url: "https://example.test/arm.dmg",
              },
              {
                name: "Baindar-0.1.0-intel.dmg",
                browser_download_url: "https://example.test/intel.dmg",
              },
            ],
          }),
          { status: 200 },
        ),
    );

    expect(await Download.resolveLatestMacAsset("arm64")).toBe("https://example.test/arm.dmg");
    expect(await Download.resolveLatestMacAsset("intel")).toBe("https://example.test/intel.dmg");
  });

  it("throws AssetNotFoundError when no asset matches the arch", async () => {
    stubFetch(
      async () =>
        new Response(
          JSON.stringify({
            assets: [
              {
                name: "Baindar-0.1.0-arm64.dmg",
                browser_download_url: "https://example.test/arm.dmg",
              },
            ],
          }),
          { status: 200 },
        ),
    );

    const err = await Download.resolveLatestMacAsset("intel").then(
      () => null,
      (e: unknown) => e,
    );
    expect(Download.AssetNotFoundError.isInstance(err)).toBe(true);
  });

  it("throws NoReleaseError when GitHub returns non-2xx", async () => {
    stubFetch(async () => new Response("", { status: 404 }));

    const err = await Download.resolveLatestMacAsset("arm64").then(
      () => null,
      (e: unknown) => e,
    );
    expect(Download.NoReleaseError.isInstance(err)).toBe(true);
  });
});
