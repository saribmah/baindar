import { eq } from "drizzle-orm";
import { user } from "../db/schema";
import { Instance } from "../instance";
import type { User } from "./user";

export namespace UserStore {
  export const entitySelect = {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    image: user.image,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  } as const;

  export type EntityRow = {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    image: string | null;
    createdAt: Date;
    updatedAt: Date;
  };

  export const toEntity = (row: EntityRow): User.Entity => ({
    id: row.id,
    email: row.email,
    name: row.name,
    emailVerified: row.emailVerified,
    image: row.image,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });

  export const get = async (id: string): Promise<User.Entity | null> => {
    const rows = await Instance.db.select(entitySelect).from(user).where(eq(user.id, id)).limit(1);
    const row = rows[0];
    return row ? toEntity(row) : null;
  };

  export const update = async (
    id: string,
    patch: { name?: string; image?: string | null },
  ): Promise<User.Entity | null> => {
    const updates: Partial<{ name: string; image: string | null; updatedAt: Date }> = {
      updatedAt: new Date(),
    };
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.image !== undefined) updates.image = patch.image;

    const rows = await Instance.db
      .update(user)
      .set(updates)
      .where(eq(user.id, id))
      .returning(entitySelect);
    const row = rows[0];
    return row ? toEntity(row) : null;
  };
}
