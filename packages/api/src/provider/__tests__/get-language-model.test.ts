import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createTestRuntime } from "../../document/__tests__/test-db";
import { encryptApiKey, lastFourOf } from "../crypto";
import { Provider } from "../provider";
import { ProviderStore } from "../provider-store";

// Provider.getLanguageModel verifies the BYOK-first / platform-fallback
// branching without actually issuing a network call. The AI SDK adapter
// is a thin wrapper around the config object, so asserting that one was
// returned (and which `byok` flag it carries) is enough — the wire-level
// behavior is exercised by the SDK's own tests, not ours.

const TEST_KEY = "Q1mZ8oP9o3xKLLwM/jw3qb0H6L2nF6Pp/dXR5N6m9KE=";

const PLATFORM_ENV = {
  PROVIDER_ENCRYPTION_KEY: TEST_KEY,
  PLATFORM_LLM_SPEC: "anthropic",
  PLATFORM_LLM_BASE_URL: "https://platform.example.com",
  PLATFORM_LLM_MODEL: "platform-model",
  PLATFORM_LLM_API_KEY: "platform-secret",
};

describe("Provider.getLanguageModel", () => {
  let runtime: ReturnType<typeof createTestRuntime>;

  beforeEach(() => {
    runtime = createTestRuntime(
      [{ id: "user-a", name: "Alice", email: "alice@example.com" }],
      PLATFORM_ENV,
    );
  });
  afterEach(() => {
    runtime.close();
  });

  it("falls back to the platform LLM when the user has no BYOK config", async () => {
    await runtime.runAs("user-a", async () => {
      const result = await Provider.getLanguageModel("user-a");
      expect(result.byok).toBe(false);
      expect(result.modelId).toBe("platform-model");
      expect(result.model).toBeDefined();
    });
  });

  it("uses the BYOK config when one is present", async () => {
    await runtime.runAs("user-a", async () => {
      const sealed = await encryptApiKey("user-secret-key");
      await ProviderStore.upsertSettings({
        userId: "user-a",
        spec: "openai",
        baseUrl: "https://byok.example.com",
        model: "byok-model",
        encryptedApiKey: sealed,
        keyLastFour: lastFourOf("user-secret-key"),
        lastValidatedAt: new Date(),
      });

      const result = await Provider.getLanguageModel("user-a");
      expect(result.byok).toBe(true);
      expect(result.modelId).toBe("byok-model");
      expect(result.model).toBeDefined();
    });
  });

  it("throws PlatformLlmNotConfiguredError when platform creds are missing", async () => {
    runtime.close();
    runtime = createTestRuntime([{ id: "user-a", name: "Alice", email: "alice@example.com" }], {
      PROVIDER_ENCRYPTION_KEY: TEST_KEY,
    });

    await runtime.runAs("user-a", async () => {
      await expect(Provider.getLanguageModel("user-a")).rejects.toMatchObject({
        name: "PlatformLlmNotConfiguredError",
      });
    });
  });
});
