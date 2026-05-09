import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Binder } from "../../binder/binder";
import { createTestRuntime, seedBinderDocument } from "../../document/__tests__/test-db";
import { Highlight } from "../../highlight/highlight";
import { Note } from "../note";

const seedDocument = (userId: string) => seedBinderDocument(userId);

describe("Note feature", () => {
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

  it("creates document-level, section-level, and highlight-attached notes and lists them", async () => {
    await runtime.runAs(userA, async () => {
      const doc = await seedDocument(userA);
      const highlight = await Highlight.create(userA, {
        documentId: doc.id,
        sectionKey: "epub:section:2",
        position: { offsetStart: 0, offsetEnd: 4 },
        textSnippet: "test",
        color: "yellow",
      });

      const docLevel = await Note.create(userA, {
        documentId: doc.id,
        body: "Whole-book thought.",
      });
      expect(docLevel.sectionKey).toBeNull();
      expect(docLevel.highlightId).toBeNull();

      const sectionLevel = await Note.create(userA, {
        documentId: doc.id,
        sectionKey: "epub:section:5",
        body: "Chapter thought.",
      });
      expect(sectionLevel.sectionKey).toBe("epub:section:5");
      expect(sectionLevel.highlightId).toBeNull();

      const onHighlight = await Note.create(userA, {
        documentId: doc.id,
        highlightId: highlight.id,
        body: "Comment on highlight.",
      });
      expect(onHighlight.highlightId).toBe(highlight.id);
      // The highlight's section is mirrored onto the note so a section-scoped
      // read also surfaces highlight comments in that section.
      expect(onHighlight.sectionKey).toBe("epub:section:2");

      const all = await Note.list(userA, { documentId: doc.id });
      expect(all).toHaveLength(3);

      const onlyHighlightComments = await Note.list(userA, {
        documentId: doc.id,
        highlightId: highlight.id,
      });
      expect(onlyHighlightComments).toHaveLength(1);
      expect(onlyHighlightComments[0]?.id).toBe(onHighlight.id);

      const sectionScoped = await Note.list(userA, {
        documentId: doc.id,
        sectionKey: "epub:section:2",
      });
      expect(sectionScoped).toHaveLength(1);
      expect(sectionScoped[0]?.id).toBe(onHighlight.id);

      const docOnly = await Note.list(userA, { documentId: doc.id, unanchored: true });
      expect(docOnly).toHaveLength(1);
      expect(docOnly[0]?.id).toBe(docLevel.id);
    });
  });

  it("updates a note body and rejects another user's note as not found", async () => {
    const docA = await runtime.runAs(userA, () => seedDocument(userA));
    const note = await runtime.runAs(userA, () =>
      Note.create(userA, {
        documentId: docA.id,
        body: "Mine.",
      }),
    );

    await runtime.runAs(userA, async () => {
      const updated = await Note.update(userA, note.id, { body: "Edited." });
      expect(updated.body).toBe("Edited.");
    });

    await runtime.runAs(userB, async () => {
      await expect(Note.update(userB, note.id, { body: "hax" })).rejects.toMatchObject({
        name: "NoteNotFoundError",
      });
      await expect(Note.remove(userB, note.id)).rejects.toMatchObject({
        name: "NoteNotFoundError",
      });
      await expect(Note.list(userB, { documentId: docA.id })).rejects.toMatchObject({
        name: "DocumentNotFoundError",
      });
    });
  });

  it("rejects attaching a note to a highlight on a different document", async () => {
    await runtime.runAs(userA, async () => {
      const docA = await seedDocument(userA);
      const docB = await seedDocument(userA);
      const highlightOnA = await Highlight.create(userA, {
        documentId: docA.id,
        sectionKey: "epub:section:0",
        position: { offsetStart: 0, offsetEnd: 4 },
        textSnippet: "test",
        color: "yellow",
      });

      await expect(
        Note.create(userA, {
          documentId: docB.id,
          highlightId: highlightOnA.id,
          body: "wrong doc",
        }),
      ).rejects.toMatchObject({ name: "NoteHighlightDocumentMismatchError" });
    });
  });

  it("cascades note delete when the parent highlight is removed", async () => {
    await runtime.runAs(userA, async () => {
      const doc = await seedDocument(userA);
      const highlight = await Highlight.create(userA, {
        documentId: doc.id,
        sectionKey: "epub:section:0",
        position: { offsetStart: 0, offsetEnd: 4 },
        textSnippet: "test",
        color: "yellow",
      });
      const standalone = await Note.create(userA, { documentId: doc.id, body: "standalone" });
      const attached = await Note.create(userA, {
        documentId: doc.id,
        highlightId: highlight.id,
        body: "attached",
      });

      await Highlight.remove(userA, highlight.id);

      // Direct binder read so we can confirm the row is gone, not just
      // hidden by a filter.
      expect(await Binder.require(userA).getNote(attached.id)).toBeNull();
      expect(await Binder.require(userA).getNote(standalone.id)).not.toBeNull();
    });
  });
});
