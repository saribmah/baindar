import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { UserStore } from "../user-store";
import { User } from "../user";

const sample: User.Entity = {
  id: "u1",
  email: "u@example.com",
  name: "U",
  emailVerified: true,
  image: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

describe("User feature", () => {
  afterEach(() => {
    spyOn(UserStore, "get").mockRestore();
    spyOn(UserStore, "update").mockRestore();
  });

  it("getMe returns the entity when storage finds it", async () => {
    spyOn(UserStore, "get").mockResolvedValue(sample);
    const result = await User.getMe("u1");
    expect(result).toEqual(sample);
  });

  it("getMe throws UserNotFoundError when storage returns null", async () => {
    spyOn(UserStore, "get").mockResolvedValue(null);
    await expect(User.getMe("missing")).rejects.toMatchObject({
      name: "UserNotFoundError",
    });
  });

  it("updateMe throws UserNotFoundError when storage returns null", async () => {
    spyOn(UserStore, "update").mockResolvedValue(null);
    await expect(User.updateMe("missing", { name: "n" })).rejects.toMatchObject({
      name: "UserNotFoundError",
    });
  });

  it("validates UpdateInput shape", () => {
    expect(() => User.UpdateInput.parse({ name: "" })).toThrow();
    expect(User.UpdateInput.parse({ name: "Sarib" })).toEqual({ name: "Sarib" });
  });
});
