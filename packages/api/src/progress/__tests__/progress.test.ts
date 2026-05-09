import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Document } from "../../document/document";
import {
  createTestRuntime,
  seedBinderDocument,
  type SeedDocumentOverrides,
} from "../../document/__tests__/test-db";
import { Progress } from "../progress";

const seedDocument = (userId: string, overrides?: SeedDocumentOverrides) =>
  seedBinderDocument(userId, overrides);

describe("Progress feature", () => {
  const userA = "user-a";
  const userB = "user-b";
  let runtime: ReturnType<typeof createTestRuntime>;

  beforeEach(() => {
    runtime = createTestRuntime([
      { id: userA, name: "Alice", email: "alice@example.com" },
      { id: userB, name: "Bob", email: "bob@example.com" },
    ]);
  });

  afterEach(() => runtime.close());

  it("upserts progress and surfaces it on Document.get", async () => {
    await runtime.runAs(userA, async () => {
      const doc = await seedDocument(userA);

      const first = await Progress.upsert(userA, doc.id, {
        sectionKey: "epub:section:3",
        progressPercent: 0.25,
      });
      expect(first.sectionKey).toBe("epub:section:3");
      expect(first.progressPercent).toBe(0.25);

      const fetched = await Document.get(userA, doc.id);
      expect(fetched.progress).not.toBeNull();
      expect(fetched.progress?.sectionKey).toBe("epub:section:3");
      expect(fetched.progress?.progressPercent).toBe(0.25);

      // Upsert overwrites in place — second call updates rather than insert.
      const second = await Progress.upsert(userA, doc.id, {
        sectionKey: "epub:section:7",
        progressPercent: 0.6,
      });
      expect(second.sectionKey).toBe("epub:section:7");

      const refetched = await Document.get(userA, doc.id);
      expect(refetched.progress?.sectionKey).toBe("epub:section:7");
      expect(refetched.progress?.progressPercent).toBe(0.6);
    });
  });

  it("treats another user's document as not found", async () => {
    const doc = await runtime.runAs(userA, () => seedDocument(userA));
    await runtime.runAs(userB, async () => {
      await expect(
        Progress.upsert(userB, doc.id, { sectionKey: "epub:section:1" }),
      ).rejects.toMatchObject({
        name: "DocumentNotFoundError",
      });
    });
  });

  it("isolates progress across users on the same document id", async () => {
    const doc = await runtime.runAs(userA, () => seedDocument(userA));
    // Both users need access — share by seeding under both.
    const docB = await runtime.runAs(userB, () => seedDocument(userB, { id: crypto.randomUUID() }));

    await runtime.runAs(userA, async () => {
      await Progress.upsert(userA, doc.id, { sectionKey: "epub:section:5" });
    });
    await runtime.runAs(userB, async () => {
      await Progress.upsert(userB, docB.id, { sectionKey: "epub:section:9" });
    });

    await runtime.runAs(userA, async () => {
      const a = await Document.get(userA, doc.id);
      expect(a.progress?.sectionKey).toBe("epub:section:5");
    });
    await runtime.runAs(userB, async () => {
      const b = await Document.get(userB, docB.id);
      expect(b.progress?.sectionKey).toBe("epub:section:9");
    });
  });
});
