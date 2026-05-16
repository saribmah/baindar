import { eq } from "drizzle-orm";
import { userProviderSettings } from "../db/schema";
import { Instance } from "../instance";
import { Provider } from "./provider";

// ProviderStore: persistence only. Reads return either the sanitized
// Provider.Entity (`getSettings`) or the raw encrypted row
// (`getRawSettings`) used by the in-process key resolver. The cleartext
// API key never leaves this module + crypto.ts.
export namespace ProviderStore {
  export const entitySelect = {
    userId: userProviderSettings.userId,
    spec: userProviderSettings.spec,
    baseUrl: userProviderSettings.baseUrl,
    model: userProviderSettings.model,
    keyLastFour: userProviderSettings.keyLastFour,
    lastValidatedAt: userProviderSettings.lastValidatedAt,
    lastUsedAt: userProviderSettings.lastUsedAt,
    createdAt: userProviderSettings.createdAt,
    updatedAt: userProviderSettings.updatedAt,
  } as const;

  type EntityRow = {
    userId: string;
    spec: string;
    baseUrl: string;
    model: string;
    keyLastFour: string;
    lastValidatedAt: Date | null;
    lastUsedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };

  const toEntity = (row: EntityRow): Provider.Entity => {
    const spec = Provider.Spec.safeParse(row.spec);
    return {
      spec: spec.success ? spec.data : "anthropic",
      baseUrl: row.baseUrl,
      model: row.model,
      keyLastFour: row.keyLastFour,
      lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  };

  export const getSettings = async (userId: string): Promise<Provider.Entity | null> => {
    const rows = await Instance.db
      .select(entitySelect)
      .from(userProviderSettings)
      .where(eq(userProviderSettings.userId, userId))
      .limit(1);
    const row = rows[0];
    return row ? toEntity(row) : null;
  };

  export const hasSettings = async (userId: string): Promise<boolean> => {
    const rows = await Instance.db
      .select({ userId: userProviderSettings.userId })
      .from(userProviderSettings)
      .where(eq(userProviderSettings.userId, userId))
      .limit(1);
    return rows.length > 0;
  };

  export type RawSettings = {
    spec: string;
    baseUrl: string;
    model: string;
    encryptedApiKey: Uint8Array;
  };

  // Reads the encrypted blob alongside the public fields. Only consumed
  // by `Provider.resolveForChat`; never exposed via a route.
  export const getRawSettings = async (userId: string): Promise<RawSettings | null> => {
    const rows = await Instance.db
      .select({
        spec: userProviderSettings.spec,
        baseUrl: userProviderSettings.baseUrl,
        model: userProviderSettings.model,
        encryptedApiKey: userProviderSettings.encryptedApiKey,
      })
      .from(userProviderSettings)
      .where(eq(userProviderSettings.userId, userId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      spec: row.spec,
      baseUrl: row.baseUrl,
      model: row.model,
      encryptedApiKey: new Uint8Array(row.encryptedApiKey),
    };
  };

  export const upsertSettings = async (input: {
    userId: string;
    spec: Provider.Spec;
    baseUrl: string;
    model: string;
    encryptedApiKey: Uint8Array;
    keyLastFour: string;
    lastValidatedAt: Date;
  }): Promise<Provider.Entity> => {
    const now = new Date();
    const encrypted = Buffer.from(input.encryptedApiKey);
    const rows = await Instance.db
      .insert(userProviderSettings)
      .values({
        userId: input.userId,
        spec: input.spec,
        baseUrl: input.baseUrl,
        model: input.model,
        encryptedApiKey: encrypted,
        keyLastFour: input.keyLastFour,
        lastValidatedAt: input.lastValidatedAt,
        lastUsedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userProviderSettings.userId,
        set: {
          spec: input.spec,
          baseUrl: input.baseUrl,
          model: input.model,
          encryptedApiKey: encrypted,
          keyLastFour: input.keyLastFour,
          lastValidatedAt: input.lastValidatedAt,
          updatedAt: now,
        },
      })
      .returning(entitySelect);
    const row = rows[0];
    if (!row) {
      throw new Error("ProviderStore.upsertSettings: row missing after upsert");
    }
    return toEntity(row);
  };

  export const deleteSettings = async (userId: string): Promise<void> => {
    await Instance.db.delete(userProviderSettings).where(eq(userProviderSettings.userId, userId));
  };

  export const touchLastUsed = async (userId: string): Promise<void> => {
    await Instance.db
      .update(userProviderSettings)
      .set({ lastUsedAt: new Date() })
      .where(eq(userProviderSettings.userId, userId));
  };
}
