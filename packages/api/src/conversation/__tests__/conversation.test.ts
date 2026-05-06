import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Conversation } from "../conversation";
import { DocumentStorage } from "../../document/storage";
import { createTestRuntime } from "../../document/__tests__/test-db";

const seedDocument = async (
  userId: string,
  overrides?: Partial<Parameters<typeof DocumentStorage.create>[0]>,
) =>
  DocumentStorage.create({
    id: crypto.randomUUID(),
    userId,
    kind: "epub",
    mimeType: "application/epub+zip",
    originalFilename: "seed.epub",
    sizeBytes: 100,
    sha256: "0".repeat(64),
    title: "Seed",
    sensitive: false,
    status: "processed",
    r2KeyOriginal: `users/${userId}/documents/seed/original.epub`,
    ...overrides,
  });

describe("Conversation feature", () => {
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

  it("creates a conversation with default title and lists it", async () => {
    await runtime.runAs(userA, async () => {
      const created = await Conversation.create(userA, {});
      expect(created.title).toBe("Untitled");
      expect(created.primaryDocId).toBeNull();
      expect(created.createdAt).toBe(created.lastActivityAt);

      const items = await Conversation.list(userA);
      expect(items).toHaveLength(1);
      expect(items[0]?.id).toBe(created.id);
    });
  });

  it("creates a conversation scoped to an owned document", async () => {
    await runtime.runAs(userA, async () => {
      const doc = await seedDocument(userA);
      const created = await Conversation.create(userA, {
        title: "About the lease",
        primaryDocId: doc.id,
      });
      expect(created.title).toBe("About the lease");
      expect(created.primaryDocId).toBe(doc.id);
    });
  });

  it("rejects scoping a conversation to a document the caller does not own", async () => {
    const doc = await runtime.runAs(userA, () => seedDocument(userA));
    await runtime.runAs(userB, async () => {
      await expect(Conversation.create(userB, { primaryDocId: doc.id })).rejects.toMatchObject({
        name: "DocumentNotFoundError",
      });
    });
  });

  it("renames a conversation and rejects another user's conversation as not found", async () => {
    const created = await runtime.runAs(userA, () => Conversation.create(userA, {}));

    await runtime.runAs(userA, async () => {
      const updated = await Conversation.update(userA, created.id, { title: "Lease talks" });
      expect(updated.title).toBe("Lease talks");
    });

    await runtime.runAs(userB, async () => {
      await expect(Conversation.update(userB, created.id, { title: "hax" })).rejects.toMatchObject({
        name: "ConversationNotFoundError",
      });
      await expect(Conversation.get(userB, created.id)).rejects.toMatchObject({
        name: "ConversationNotFoundError",
      });
      await expect(Conversation.remove(userB, created.id)).rejects.toMatchObject({
        name: "ConversationNotFoundError",
      });
      // userB's list should not see userA's conversation.
      const items = await Conversation.list(userB);
      expect(items).toHaveLength(0);
    });
  });

  it("orders list by lastActivityAt desc and bumps it via touch", async () => {
    await runtime.runAs(userA, async () => {
      const first = await Conversation.create(userA, { title: "First" });
      // Sleep just enough that the timestamp resolution (ms) advances.
      await new Promise((r) => setTimeout(r, 5));
      const second = await Conversation.create(userA, { title: "Second" });

      let items = await Conversation.list(userA);
      expect(items.map((c) => c.id)).toEqual([second.id, first.id]);

      await new Promise((r) => setTimeout(r, 5));
      await Conversation.touch(userA, first.id);

      items = await Conversation.list(userA);
      expect(items.map((c) => c.id)).toEqual([first.id, second.id]);
    });
  });

  it("cascades conversation delete when the primary document is removed", async () => {
    await runtime.runAs(userA, async () => {
      const doc = await seedDocument(userA);
      const scoped = await Conversation.create(userA, { primaryDocId: doc.id });
      const unscoped = await Conversation.create(userA, {});

      await DocumentStorage.remove(doc.id, userA);

      const items = await Conversation.list(userA);
      expect(items.map((c) => c.id)).toEqual([unscoped.id]);
      await expect(Conversation.get(userA, scoped.id)).rejects.toMatchObject({
        name: "ConversationNotFoundError",
      });
    });
  });

  it("ownerOf returns the user_id for an existing row, null otherwise", async () => {
    const created = await runtime.runAs(userA, () => Conversation.create(userA, {}));
    // ownerOf is unscoped on purpose — used internally by the chat agent's
    // DO, where the only handle is the conversationId.
    await runtime.runAs(userB, async () => {
      expect(await Conversation.ownerOf(created.id)).toBe(userA);
      expect(await Conversation.ownerOf("does-not-exist")).toBeNull();
    });
  });

  it("removes a conversation and 404s on a second delete", async () => {
    await runtime.runAs(userA, async () => {
      const created = await Conversation.create(userA, {});
      await Conversation.remove(userA, created.id);
      await expect(Conversation.remove(userA, created.id)).rejects.toMatchObject({
        name: "ConversationNotFoundError",
      });
    });
  });

  it("wipes the chat DO storage on remove (and skips destroy on cross-user delete)", async () => {
    const created = await runtime.runAs(userA, () => Conversation.create(userA, {}));

    // Cross-user delete must NOT touch the DO — ownership check fails first.
    await runtime.runAs(userB, async () => {
      await expect(Conversation.remove(userB, created.id)).rejects.toMatchObject({
        name: "ConversationNotFoundError",
      });
    });
    expect(runtime.destroyedConversationIds).toHaveLength(0);

    // Owner delete destroys the DO storage and removes the row.
    await runtime.runAs(userA, () => Conversation.remove(userA, created.id));
    expect(runtime.destroyedConversationIds).toEqual([created.id]);
  });
});
