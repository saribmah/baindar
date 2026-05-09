import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createTestRuntime,
  seedBinderDocument,
  seedBinderProgress,
} from "../../document/__tests__/test-db";
import { Shelf } from "../shelf";

// Shelf tests only need a document row to exist with the right userId; no
// parsing / R2 work is required to exercise shelf CRUD.
const seedDocument = async (
  userId: string,
  opts: { id?: string; title?: string } = {},
): Promise<string> => {
  const seeded = await seedBinderDocument(userId, {
    id: opts.id,
    title: opts.title ?? (opts.id ? `Seed ${opts.id.slice(0, 8)}` : undefined),
  });
  return seeded.id;
};

const seedProgress = (userId: string, documentId: string, progressPercent: number | null) =>
  seedBinderProgress(userId, documentId, progressPercent);

describe("Shelf feature", () => {
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

  it("lists smart shelves first, then custom shelves with item counts", async () => {
    await runtime.runAs(userA, async () => {
      const a = await Shelf.create(userA, { name: "Design talk" });
      const b = await Shelf.create(userA, { name: "Long-form" });

      const docId = await seedDocument(userA, { title: "DOET" });
      await Shelf.addDocument(userA, a.id, docId);

      const items = await Shelf.list(userA);
      expect(items.length).toBe(4);
      // Smart shelves are deterministic; ordering between two custom shelves
      // created in the same second falls through to undefined SQLite order
      // (createdAt is stored at second precision via drizzle's "timestamp"
      // mode), so we assert by membership not index.
      expect(items[0]).toMatchObject({ kind: "smart", smartType: "reading", itemCount: 0 });
      expect(items[1]).toMatchObject({ kind: "smart", smartType: "finished", itemCount: 0 });

      const customs = items.filter((i) => i.kind === "custom");
      expect(customs.map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
      const aShelf = customs.find((s) => s.id === a.id);
      const bShelf = customs.find((s) => s.id === b.id);
      expect(aShelf?.itemCount).toBe(1);
      expect(bShelf?.itemCount).toBe(0);
    });
  });

  it("rejects creating a shelf whose name clashes case-insensitively", async () => {
    await runtime.runAs(userA, async () => {
      await Shelf.create(userA, { name: "Design talk" });
      await expect(Shelf.create(userA, { name: "design TALK" })).rejects.toMatchObject({
        name: "ShelfNameTakenError",
      });
    });
  });

  it("adding a document is idempotent and a re-add is a no-op", async () => {
    await runtime.runAs(userA, async () => {
      const shelf = await Shelf.create(userA, { name: "Reading list" });
      const docId = await seedDocument(userA);

      await Shelf.addDocument(userA, shelf.id, docId);
      await Shelf.addDocument(userA, shelf.id, docId);

      const docs = await Shelf.listDocuments(userA, shelf.id);
      expect(docs.map((d) => d.id)).toEqual([docId]);

      const refetched = await Shelf.get(userA, shelf.id);
      expect(refetched).toMatchObject({ kind: "custom", itemCount: 1 });
    });
  });

  it("rejects adding a document the caller doesn't own", async () => {
    const docId = await runtime.runAs(userA, () => seedDocument(userA));

    await runtime.runAs(userB, async () => {
      const shelf = await Shelf.create(userB, { name: "Mine" });
      await expect(Shelf.addDocument(userB, shelf.id, docId)).rejects.toMatchObject({
        name: "DocumentNotFoundError",
      });
    });
  });

  it("blocks every write against smart shelves", async () => {
    await runtime.runAs(userA, async () => {
      const docId = await seedDocument(userA);

      await expect(Shelf.update(userA, "smart:reading", { name: "Renamed" })).rejects.toMatchObject(
        { name: "ShelfSmartWriteError" },
      );

      await expect(Shelf.remove(userA, "smart:finished")).rejects.toMatchObject({
        name: "ShelfSmartWriteError",
      });

      await expect(Shelf.addDocument(userA, "smart:reading", docId)).rejects.toMatchObject({
        name: "ShelfSmartWriteError",
      });

      await expect(Shelf.removeDocument(userA, "smart:reading", docId)).rejects.toMatchObject({
        name: "ShelfSmartWriteError",
      });
    });
  });

  it("synthesizes smart shelves from progress: reading vs finished", async () => {
    await runtime.runAs(userA, async () => {
      const a = await seedDocument(userA, { title: "A" });
      const b = await seedDocument(userA, { title: "B" });
      const c = await seedDocument(userA, { title: "C" });
      const d = await seedDocument(userA, { title: "D" });

      // a: started, partial → reading. b: opened with null percent → reading.
      // c: finished. d: no progress row → on neither smart shelf.
      await seedProgress(userA, a, 0.4);
      await seedProgress(userA, b, null);
      await seedProgress(userA, c, 1);
      void d;

      const items = await Shelf.list(userA);
      const reading = items.find((i) => i.kind === "smart" && i.smartType === "reading");
      const finished = items.find((i) => i.kind === "smart" && i.smartType === "finished");
      expect(reading?.itemCount).toBe(2);
      expect(finished?.itemCount).toBe(1);

      const readingDocs = await Shelf.listDocuments(userA, "smart:reading");
      expect(readingDocs.map((doc) => doc.id).sort()).toEqual([a, b].sort());

      const finishedDocs = await Shelf.listDocuments(userA, "smart:finished");
      expect(finishedDocs.map((doc) => doc.id)).toEqual([c]);
    });
  });

  it("isolates shelves and membership across users", async () => {
    const setup = await runtime.runAs(userA, async () => {
      const shelf = await Shelf.create(userA, { name: "Private" });
      const docId = await seedDocument(userA);
      await Shelf.addDocument(userA, shelf.id, docId);
      return { shelfId: shelf.id, docId };
    });

    await runtime.runAs(userB, async () => {
      const items = await Shelf.list(userB);
      // Smart shelves still appear (with zero counts), but no custom ones.
      expect(items.filter((i) => i.kind === "custom")).toEqual([]);

      await expect(Shelf.get(userB, setup.shelfId)).rejects.toMatchObject({
        name: "ShelfNotFoundError",
      });
      await expect(Shelf.listDocuments(userB, setup.shelfId)).rejects.toMatchObject({
        name: "ShelfNotFoundError",
      });
      await expect(Shelf.addDocument(userB, setup.shelfId, setup.docId)).rejects.toMatchObject({
        name: "ShelfNotFoundError",
      });
    });
  });

  it("removes a document from a shelf and 404s on a second remove", async () => {
    await runtime.runAs(userA, async () => {
      const shelf = await Shelf.create(userA, { name: "Temp" });
      const docId = await seedDocument(userA);

      await Shelf.addDocument(userA, shelf.id, docId);
      await Shelf.removeDocument(userA, shelf.id, docId);

      await expect(Shelf.removeDocument(userA, shelf.id, docId)).rejects.toMatchObject({
        name: "ShelfDocumentNotOnShelfError",
      });
    });
  });

  it("lists custom shelves containing a document via the reverse lookup", async () => {
    await runtime.runAs(userA, async () => {
      const docId = await seedDocument(userA, { title: "Shared" });
      const a = await Shelf.create(userA, { name: "Alpha" });
      const b = await Shelf.create(userA, { name: "Beta" });
      const c = await Shelf.create(userA, { name: "Gamma" });
      void c;
      await Shelf.addDocument(userA, a.id, docId);
      await Shelf.addDocument(userA, b.id, docId);

      const shelves = await Shelf.listForDocument(userA, docId);
      expect(shelves.map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
      expect(shelves.every((s) => s.kind === "custom")).toBe(true);
    });
  });

  it("deleting a shelf cascades its membership rows", async () => {
    await runtime.runAs(userA, async () => {
      const shelf = await Shelf.create(userA, { name: "Doomed" });
      const docId = await seedDocument(userA);
      await Shelf.addDocument(userA, shelf.id, docId);

      await Shelf.remove(userA, shelf.id);

      // Reverse lookup confirms the membership row was cleaned up.
      const shelves = await Shelf.listForDocument(userA, docId);
      expect(shelves).toEqual([]);
    });
  });

  it("rejects renaming to an already-taken name", async () => {
    await runtime.runAs(userA, async () => {
      const a = await Shelf.create(userA, { name: "Alpha" });
      await Shelf.create(userA, { name: "Beta" });

      await expect(Shelf.update(userA, a.id, { name: "beta" })).rejects.toMatchObject({
        name: "ShelfNameTakenError",
      });

      // Renaming a shelf to its own current name (case-insensitive) is fine.
      const renamed = await Shelf.update(userA, a.id, { name: "ALPHA" });
      expect(renamed.name).toBe("ALPHA");
    });
  });
});
