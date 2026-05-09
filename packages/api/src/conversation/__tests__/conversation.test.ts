import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Context } from "hono";
import type { AppEnv } from "../../app/context";
import { Binder } from "../../binder/binder";
import { Conversation } from "../conversation";
import { createTestRuntime, seedBinderDocument } from "../../document/__tests__/test-db";
import { requireOwnAgentInstance } from "../../middleware/agent-instance";

const seedDocument = (userId: string) => seedBinderDocument(userId);

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
      expect(created.agentName).toBe(`${userA}:${created.id}`);
      expect(created.primaryDocId).toBeNull();
      expect(created.createdAt).toBe(created.lastActivityAt);

      const items = await Conversation.list(userA);
      expect(items).toHaveLength(1);
      expect(items[0]?.id).toBe(created.id);
      expect(items[0]?.agentName).toBe(created.agentName);
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
      expect(updated.agentName).toBe(`${userA}:${created.id}`);
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

  it("nulls primaryDocId on conversations when the primary document is removed", async () => {
    await runtime.runAs(userA, async () => {
      const doc = await seedDocument(userA);
      const scoped = await Conversation.create(userA, { primaryDocId: doc.id });
      const unscoped = await Conversation.create(userA, {});

      await Binder.require(userA).removeDocument(doc.id);

      const items = await Conversation.list(userA);
      // Both conversations survive — only `primaryDocId` clears.
      const ids = items.map((c) => c.id).sort();
      expect(ids).toEqual([scoped.id, unscoped.id].sort());

      const after = await Conversation.get(userA, scoped.id);
      expect(after.primaryDocId).toBeNull();
      expect(after.agentName).toBe(`${userA}:${scoped.id}`);
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

  it("accepts composite agentName and rejects bare conversation ids", async () => {
    const created = await runtime.runAs(userA, () => Conversation.create(userA, {}));

    await runtime.runAs(userA, async () => {
      let nextCalled = false;
      const accepted = await requireOwnAgentInstance(
        fakeContext(`http://example.test/agents/chat-agent/${created.agentName}/chat`),
        async () => {
          nextCalled = true;
        },
      );
      expect(accepted).toBeUndefined();
      expect(nextCalled).toBe(true);

      nextCalled = false;
      const rejected = await requireOwnAgentInstance(
        fakeContext(`http://example.test/agents/chat-agent/${created.id}/chat`),
        async () => {
          nextCalled = true;
        },
      );
      expect(nextCalled).toBe(false);
      expect(rejected).toBeInstanceOf(Response);
      expect((rejected as Response).status).toBe(400);
    });
  });

  it("rejects composite agent names for another user", async () => {
    const created = await runtime.runAs(userA, () => Conversation.create(userA, {}));

    await runtime.runAs(userB, async () => {
      let nextCalled = false;
      const rejected = await requireOwnAgentInstance(
        fakeContext(`http://example.test/agents/chat-agent/${created.agentName}/chat`),
        async () => {
          nextCalled = true;
        },
      );
      expect(nextCalled).toBe(false);
      expect(rejected).toBeInstanceOf(Response);
      expect((rejected as Response).status).toBe(403);
    });
  });
});

const fakeContext = (url: string): Context<AppEnv> =>
  ({
    req: { url },
    json: (payload: unknown, status: number) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      }),
  }) as unknown as Context<AppEnv>;
