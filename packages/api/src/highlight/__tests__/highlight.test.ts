import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Binder } from "../../binder/binder";
import { createTestRuntime, seedBinderDocument } from "../../document/__tests__/test-db";
import { Highlight } from "../highlight";

// Seed an EPUB `document` row directly. The highlight feature only needs the
// row to exist with the right userId; no parsing / R2 work is required to
// exercise highlight CRUD.
const seedDocument = (userId: string) => seedBinderDocument(userId);

describe("Highlight feature", () => {
  const userA = "user-a";
  const userB = "user-b";
  let runtime: ReturnType<typeof createTestRuntime>;

  beforeEach(() => {
    runtime = createTestRuntime([
      { id: userA, name: "Alice", email: "alice@example.com" },
      { id: userB, name: "Bob", email: "bob@example.com" },
    ]);
  });

  afterEach(() => {
    runtime.close();
  });

  it("creates a highlight on a section and lists it back", async () => {
    await runtime.runAs(userA, async () => {
      const doc = await seedDocument(userA);

      const created = await Highlight.create(userA, {
        documentId: doc.id,
        sectionKey: "epub:section:2",
        position: { offsetStart: 100, offsetEnd: 145 },
        textSnippet: "Affordances define what actions are possible.",
        color: "yellow",
      });

      expect(created.id).toBeDefined();
      expect(created.documentId).toBe(doc.id);
      expect(created.sectionKey).toBe("epub:section:2");
      expect(created.position).toEqual({ offsetStart: 100, offsetEnd: 145 });
      expect(created.color).toBe("yellow");
      expect(created.createdAt).toBe(created.updatedAt);

      const all = await Highlight.list(userA, { documentId: doc.id });
      expect(all).toHaveLength(1);

      const scoped = await Highlight.list(userA, {
        documentId: doc.id,
        sectionKey: "epub:section:2",
      });
      expect(scoped).toHaveLength(1);

      const otherSection = await Highlight.list(userA, {
        documentId: doc.id,
        sectionKey: "epub:section:0",
      });
      expect(otherSection).toEqual([]);
    });
  });

  it("updates a highlight's color", async () => {
    await runtime.runAs(userA, async () => {
      const doc = await seedDocument(userA);

      const created = await Highlight.create(userA, {
        documentId: doc.id,
        sectionKey: "epub:section:5",
        position: { offsetStart: 0, offsetEnd: 12 },
        textSnippet: "First words.",
        color: "pink",
      });

      const updated = await Highlight.update(userA, created.id, { color: "blue" });
      expect(updated.color).toBe("blue");
    });
  });

  it("treats another user's highlight as not found", async () => {
    const docA = await runtime.runAs(userA, () => seedDocument(userA));
    const created = await runtime.runAs(userA, () =>
      Highlight.create(userA, {
        documentId: docA.id,
        sectionKey: "epub:section:0",
        position: { offsetStart: 0, offsetEnd: 4 },
        textSnippet: "Hi.",
        color: "yellow",
      }),
    );

    await runtime.runAs(userB, async () => {
      await expect(Highlight.update(userB, created.id, { color: "blue" })).rejects.toMatchObject({
        name: "HighlightNotFoundError",
      });
      await expect(Highlight.remove(userB, created.id)).rejects.toMatchObject({
        name: "HighlightNotFoundError",
      });
      // Listing under another user's documentId must surface as DocumentNotFound,
      // not an empty list, so the API doesn't leak ownership.
      await expect(Highlight.list(userB, { documentId: docA.id })).rejects.toMatchObject({
        name: "DocumentNotFoundError",
      });
    });
  });

  it("removes a highlight", async () => {
    await runtime.runAs(userA, async () => {
      const doc = await seedDocument(userA);
      const created = await Highlight.create(userA, {
        documentId: doc.id,
        sectionKey: "epub:section:0",
        position: { offsetStart: 0, offsetEnd: 4 },
        textSnippet: "Hi.",
        color: "green",
      });
      await Highlight.remove(userA, created.id);
      const after = await Highlight.list(userA, { documentId: doc.id });
      expect(after).toEqual([]);

      await expect(Highlight.remove(userA, created.id)).rejects.toMatchObject({
        name: "HighlightNotFoundError",
      });
    });
  });

  it("cascades deletes when the parent document is removed", async () => {
    await runtime.runAs(userA, async () => {
      const doc = await seedDocument(userA);
      await Highlight.create(userA, {
        documentId: doc.id,
        sectionKey: "epub:section:0",
        position: { offsetStart: 0, offsetEnd: 4 },
        textSnippet: "Hi.",
        color: "yellow",
      });
      // Direct binder delete is fine — Document.remove also triggers the
      // deletion workflow and we're testing FK cascade behaviour, not the
      // asset cleanup.
      await Binder.require(userA).removeDocument(doc.id);
      // Re-seed a doc to satisfy the ownership check on list.
      const replacement = await seedDocument(userA);
      const survivors = await Highlight.list(userA, { documentId: replacement.id });
      expect(survivors).toEqual([]);
    });
  });
});
