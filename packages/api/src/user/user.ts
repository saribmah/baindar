import { z } from "zod";
import { NamedError } from "../utils/error";
import { UserStore } from "./user-store";

export namespace User {
  export const UserNotFoundError = NamedError.create(
    "UserNotFoundError",
    z.object({ id: z.string(), message: z.string().optional() }),
  );
  export type UserNotFoundError = InstanceType<typeof UserNotFoundError>;

  export const Entity = z
    .object({
      id: z.string(),
      email: z.email(),
      name: z.string(),
      emailVerified: z.boolean(),
      image: z.string().nullable(),
      createdAt: z.string(),
      updatedAt: z.string(),
    })
    .meta({ ref: "User" });
  export type Entity = z.infer<typeof Entity>;

  export const UpdateInput = z.object({
    name: z.string().min(1).max(100).optional(),
    image: z.string().url().nullable().optional(),
  });
  export type UpdateInput = z.infer<typeof UpdateInput>;

  export const getMe = async (userId: string): Promise<Entity> => {
    const entity = await UserStore.get(userId);
    if (!entity) throw new UserNotFoundError({ id: userId });
    return entity;
  };

  export const updateMe = async (userId: string, input: UpdateInput): Promise<Entity> => {
    const updated = await UserStore.update(userId, input);
    if (!updated) throw new UserNotFoundError({ id: userId });
    return updated;
  };
}
