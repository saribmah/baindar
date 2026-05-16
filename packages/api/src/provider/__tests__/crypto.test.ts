import { describe, expect, it } from "bun:test";
import { createTestRuntime } from "../../document/__tests__/test-db";
import { decryptApiKey, encryptApiKey, lastFourOf } from "../crypto";

// Generated once with `openssl rand -base64 32`; pinned for deterministic
// test runs. Never used outside tests.
const TEST_KEY = "Q1mZ8oP9o3xKLLwM/jw3qb0H6L2nF6Pp/dXR5N6m9KE=";

describe("provider crypto", () => {
  it("encrypts and decrypts an api key back to the original plaintext", async () => {
    const runtime = createTestRuntime([{ id: "u", name: "u", email: "u@e" }], {
      PROVIDER_ENCRYPTION_KEY: TEST_KEY,
    });
    try {
      await runtime.runAs("u", async () => {
        const plaintext = "sk-ant-api03-abc123-xyz789";
        const sealed = await encryptApiKey(plaintext);
        const back = await decryptApiKey(sealed);
        expect(back).toBe(plaintext);
      });
    } finally {
      runtime.close();
    }
  });

  it("produces different ciphertext for the same plaintext on each encrypt (fresh IV)", async () => {
    const runtime = createTestRuntime([{ id: "u", name: "u", email: "u@e" }], {
      PROVIDER_ENCRYPTION_KEY: TEST_KEY,
    });
    try {
      await runtime.runAs("u", async () => {
        const plaintext = "sk-test";
        const a = await encryptApiKey(plaintext);
        const b = await encryptApiKey(plaintext);
        // Ciphertexts differ because the 12-byte IV is regenerated each call.
        expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
        // Both still decrypt to the original.
        expect(await decryptApiKey(a)).toBe(plaintext);
        expect(await decryptApiKey(b)).toBe(plaintext);
      });
    } finally {
      runtime.close();
    }
  });

  it("rejects a master key that doesn't decode to 32 bytes", async () => {
    const runtime = createTestRuntime([{ id: "u", name: "u", email: "u@e" }], {
      PROVIDER_ENCRYPTION_KEY: "dG9vc2hvcnQ=", // base64 of "tooshort" (8 bytes)
    });
    try {
      await runtime.runAs("u", async () => {
        await expect(encryptApiKey("anything")).rejects.toThrow(/32 bytes/);
      });
    } finally {
      runtime.close();
    }
  });

  it("rejects ciphertext shorter than the IV", async () => {
    const runtime = createTestRuntime([{ id: "u", name: "u", email: "u@e" }], {
      PROVIDER_ENCRYPTION_KEY: TEST_KEY,
    });
    try {
      await runtime.runAs("u", async () => {
        const tooShort = new Uint8Array(4);
        await expect(decryptApiKey(tooShort)).rejects.toThrow(/too short/);
      });
    } finally {
      runtime.close();
    }
  });

  describe("lastFourOf", () => {
    it("returns the last 4 chars of a normal key", () => {
      expect(lastFourOf("sk-ant-api03-abc123xyzabcd")).toBe("abcd");
    });

    it("returns the whole string for keys shorter than 4 chars", () => {
      expect(lastFourOf("ab")).toBe("ab");
    });

    it("trims whitespace before slicing", () => {
      expect(lastFourOf("  sk-abcd  ")).toBe("abcd");
    });
  });
});
