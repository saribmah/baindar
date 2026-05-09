import { eq } from "drizzle-orm";
import { Config } from "../config/config";
import { user } from "../db/schema";
import { session as sessionTable } from "../db/schema/auth";
import { Instance } from "../instance";

// All D1 + R2 work for the test-mode endpoints. Keeps the feature module
// thin; ownership checks aren't relevant here because every route already
// gates on Config.isTestMode().
export namespace TestModeStore {
  // Better Auth sessions. The default expiry for the bearer plugin is fine
  // for tests; we just need any future timestamp.
  const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

  export type UpsertInput = {
    email: string;
    name: string;
  };

  export type UpsertResult = {
    userId: string;
    sessionToken: string;
  };

  export const upsertUserAndSession = async (input: UpsertInput): Promise<UpsertResult> => {
    const db = Instance.db;
    const now = new Date();

    const existing = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, input.email))
      .limit(1);
    let userId = existing[0]?.id;
    if (!userId) {
      userId = crypto.randomUUID();
      await db.insert(user).values({
        id: userId,
        name: input.name,
        email: input.email,
        emailVerified: true,
        image: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    const sessionToken = crypto.randomUUID();
    await db.insert(sessionTable).values({
      id: crypto.randomUUID(),
      token: sessionToken,
      userId,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    });

    return { userId, sessionToken };
  };

  // FK cascades on `user` clean up session/account/verification/document and
  // every per-format child. We sweep R2 separately because no FK reaches into
  // the bucket.
  export const wipeAll = async (): Promise<void> => {
    await Instance.db.delete(user);
    await sweepR2();
  };

  const sweepR2 = async (): Promise<void> => {
    const bucket = Config.requireR2Bucket();
    let cursor: string | undefined;
    while (true) {
      const page = await bucket.list({ prefix: "users/", cursor });
      const keys = page.objects.map((o) => o.key);
      if (keys.length > 0) await bucket.delete(keys);
      if (!page.truncated) break;
      cursor = page.cursor;
    }
  };
}
