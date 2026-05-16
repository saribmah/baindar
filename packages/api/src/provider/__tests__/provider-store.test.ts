import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createTestRuntime } from "../../document/__tests__/test-db";
import { Provider } from "../provider";
import { ProviderStore } from "../provider-store";

// Storage tests — exercise the upsert/get/delete flow with real SQLite
// without going through Provider.set (which requires a live network
// validation call). The store is the only path the cleartext API key
// touches the DB, so verifying it round-trips through the encrypted
// blob is sufficient for the data layer.

const TEST_KEY = "Q1mZ8oP9o3xKLLwM/jw3qb0H6L2nF6Pp/dXR5N6m9KE=";

describe("ProviderStore", () => {
  let runtime: ReturnType<typeof createTestRuntime>;
  beforeEach(() => {
    runtime = createTestRuntime([{ id: "user-a", name: "Alice", email: "alice@example.com" }], {
      PROVIDER_ENCRYPTION_KEY: TEST_KEY,
    });
  });
  afterEach(() => {
    runtime.close();
  });

  const sampleSealed = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 99]);

  it("returns null when the user has no settings", async () => {
    await runtime.runAs("user-a", async () => {
      expect(await ProviderStore.getSettings("user-a")).toBeNull();
      expect(await ProviderStore.hasSettings("user-a")).toBe(false);
    });
  });

  it("upserts and reads back the sanitized entity (no key bytes)", async () => {
    await runtime.runAs("user-a", async () => {
      await ProviderStore.upsertSettings({
        userId: "user-a",
        spec: "anthropic",
        baseUrl: "https://api.anthropic.com/v1",
        model: "claude-sonnet-4-5",
        encryptedApiKey: sampleSealed,
        keyLastFour: "wxyz",
        lastValidatedAt: new Date("2026-05-16T10:00:00Z"),
      });
      const entity = await ProviderStore.getSettings("user-a");
      expect(entity).not.toBeNull();
      expect(entity?.spec).toBe("anthropic");
      expect(entity?.baseUrl).toBe("https://api.anthropic.com/v1");
      expect(entity?.model).toBe("claude-sonnet-4-5");
      expect(entity?.keyLastFour).toBe("wxyz");
      // Sanitized entity must not expose the encrypted blob.
      expect(entity).not.toHaveProperty("encryptedApiKey");
      expect(await ProviderStore.hasSettings("user-a")).toBe(true);
    });
  });

  it("getRawSettings exposes the encrypted blob for the in-process resolver", async () => {
    await runtime.runAs("user-a", async () => {
      await ProviderStore.upsertSettings({
        userId: "user-a",
        spec: "openai",
        baseUrl: "https://openrouter.ai/api/v1",
        model: "anthropic/claude-sonnet-4-5",
        encryptedApiKey: sampleSealed,
        keyLastFour: "abcd",
        lastValidatedAt: new Date(),
      });
      const raw = await ProviderStore.getRawSettings("user-a");
      expect(raw?.spec).toBe("openai");
      expect(raw?.baseUrl).toBe("https://openrouter.ai/api/v1");
      expect(raw?.model).toBe("anthropic/claude-sonnet-4-5");
      expect(Buffer.from(raw!.encryptedApiKey).equals(Buffer.from(sampleSealed))).toBe(true);
    });
  });

  it("upsert overwrites an existing row (last-write-wins on user_id)", async () => {
    await runtime.runAs("user-a", async () => {
      await ProviderStore.upsertSettings({
        userId: "user-a",
        spec: "anthropic",
        baseUrl: "https://first",
        model: "first-model",
        encryptedApiKey: sampleSealed,
        keyLastFour: "1111",
        lastValidatedAt: new Date(),
      });
      await ProviderStore.upsertSettings({
        userId: "user-a",
        spec: "openai",
        baseUrl: "https://second",
        model: "second-model",
        encryptedApiKey: sampleSealed,
        keyLastFour: "2222",
        lastValidatedAt: new Date(),
      });
      const entity = await ProviderStore.getSettings("user-a");
      expect(entity?.spec).toBe("openai");
      expect(entity?.baseUrl).toBe("https://second");
      expect(entity?.model).toBe("second-model");
      expect(entity?.keyLastFour).toBe("2222");
    });
  });

  it("deleteSettings removes the row", async () => {
    await runtime.runAs("user-a", async () => {
      await ProviderStore.upsertSettings({
        userId: "user-a",
        spec: "anthropic",
        baseUrl: "https://x",
        model: "x",
        encryptedApiKey: sampleSealed,
        keyLastFour: "xxxx",
        lastValidatedAt: new Date(),
      });
      await ProviderStore.deleteSettings("user-a");
      expect(await ProviderStore.getSettings("user-a")).toBeNull();
      expect(await Provider.hasConfigured("user-a")).toBe(false);
    });
  });
});
