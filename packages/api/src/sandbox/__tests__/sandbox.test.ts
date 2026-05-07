import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { ExecOptions, ExecResult, MountBucketOptions } from "@cloudflare/sandbox";
import { DocumentStorage } from "../../document/storage";
import { createTestRuntime } from "../../document/__tests__/test-db";
import { Sandbox } from "../sandbox";

type MountCall = {
  bucket: string;
  mountPath: string;
  options: MountBucketOptions;
};

type ExecCall = {
  command: string;
  options: ExecOptions | undefined;
};

class FakeSandboxClient implements Sandbox.Client {
  mountCalls: MountCall[] = [];
  mkdirCalls: Array<{ path: string; recursive: boolean | undefined }> = [];
  writes = new Map<string, string>();
  execCalls: ExecCall[] = [];
  mountError: unknown = null;
  execResult: ExecResult = {
    success: true,
    exitCode: 0,
    stdout: "ok",
    stderr: "",
    command: "bash",
    duration: 12,
    timestamp: new Date(0).toISOString(),
  };

  async mountBucket(bucket: string, mountPath: string, options: MountBucketOptions): Promise<void> {
    this.mountCalls.push({ bucket, mountPath, options });
    if (this.mountError) throw this.mountError;
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    this.mkdirCalls.push({ path, recursive: options?.recursive });
  }

  async writeFile(path: string, content: string | ReadableStream<Uint8Array>): Promise<void> {
    if (typeof content !== "string") throw new Error("Unexpected stream write");
    this.writes.set(path, content);
  }

  async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
    this.execCalls.push({ command, options });
    return { ...this.execResult, command };
  }
}

const seedDocument = async (userId: string, id: string, title: string) =>
  DocumentStorage.create({
    id,
    userId,
    kind: "epub",
    mimeType: "application/epub+zip",
    originalFilename: `${title}.epub`,
    sizeBytes: 100,
    sha256: "0".repeat(64),
    title,
    sensitive: false,
    status: "processed",
    r2KeyOriginal: `users/${userId}/documents/${id}/original.epub`,
  });

describe("Sandbox feature", () => {
  const userA = "user-a";
  const userB = "user-b";
  let runtime: ReturnType<typeof createTestRuntime>;
  let clients: Map<string, FakeSandboxClient>;
  let restoreClientFactory: (() => void) | null;

  beforeEach(() => {
    clients = new Map();
    restoreClientFactory = Sandbox.setClientFactoryForTests((sandboxId) => {
      let client = clients.get(sandboxId);
      if (!client) {
        client = new FakeSandboxClient();
        clients.set(sandboxId, client);
      }
      return client;
    });
    runtime = createTestRuntime([
      { id: userA, name: "Alice", email: "alice@example.com" },
      { id: userB, name: "Bob", email: "bob@example.com" },
    ]);
  });

  afterEach(() => {
    restoreClientFactory?.();
    runtime.close();
  });

  it("uses one stable sandbox id per user", () => {
    expect(Sandbox.sandboxIdForUser(userA)).toBe(Sandbox.sandboxIdForUser(userA));
    expect(Sandbox.sandboxIdForUser(userA)).not.toBe(Sandbox.sandboxIdForUser(userB));
  });

  it("mounts the local R2 binding read-only under the user's document prefix", async () => {
    await runtime.runAs(userA, () => Sandbox.prepareForUser(userA));

    const client = clients.get(Sandbox.sandboxIdForUser(userA));
    expect(client?.mountCalls).toHaveLength(1);
    expect(client?.mountCalls[0]).toEqual({
      bucket: "BUCKET",
      mountPath: Sandbox.DocumentsMountPath,
      options: {
        localBucket: true,
        prefix: "/users/user-a/documents/",
        readOnly: true,
      },
    });
  });

  it("mounts production R2 with endpoint credentials", async () => {
    runtime.close();
    runtime = createTestRuntime([{ id: userA, name: "Alice", email: "alice@example.com" }], {
      SANDBOX_R2_LOCAL: "false",
      SANDBOX_R2_BUCKET_NAME: "baindar-assets",
      CLOUDFLARE_ACCOUNT_ID: "account-123",
      R2_ACCESS_KEY_ID: "access-key",
      R2_SECRET_ACCESS_KEY: "secret-key",
    });

    await runtime.runAs(userA, () => Sandbox.prepareForUser(userA));

    const client = clients.get(Sandbox.sandboxIdForUser(userA));
    expect(client?.mountCalls[0]).toEqual({
      bucket: "baindar-assets",
      mountPath: Sandbox.DocumentsMountPath,
      options: {
        endpoint: "https://account-123.r2.cloudflarestorage.com",
        provider: "r2",
        credentials: {
          accessKeyId: "access-key",
          secretAccessKey: "secret-key",
        },
        prefix: "/users/user-a/documents/",
        readOnly: true,
      },
    });
  });

  it("treats an already-mounted path as prepared", async () => {
    const client = clients.get(Sandbox.sandboxIdForUser(userA)) ?? new FakeSandboxClient();
    clients.set(Sandbox.sandboxIdForUser(userA), client);
    client.mountError = new Error("InvalidMountConfigError: Mount path already in use");

    await expect(
      runtime.runAs(userA, () => Sandbox.prepareForUser(userA)),
    ).resolves.toBeUndefined();
  });

  it("runs bash with catalog env and truncates large output", async () => {
    await runtime.runAs(userA, () => seedDocument(userA, "doc-a", "Lease"));
    await runtime.runAs(userB, () => seedDocument(userB, "doc-b", "Other User Receipt"));

    const client = clients.get(Sandbox.sandboxIdForUser(userA)) ?? new FakeSandboxClient();
    clients.set(Sandbox.sandboxIdForUser(userA), client);
    client.execResult = {
      ...client.execResult,
      stdout: "x".repeat(20_010),
      stderr: "",
      duration: 34,
    };

    const result = await runtime.runAs(userA, () =>
      Sandbox.runBash(userA, { command: 'rg Lease "$BAINDAR_DOCUMENTS_DIR"', timeoutMs: 5_000 }),
    );

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.duration).toBe(34);
    expect(result.truncated).toBe(true);
    expect(result.stdout.endsWith("[truncated]")).toBe(true);

    const catalog = JSON.parse(client.writes.get(Sandbox.CatalogPath) ?? "{}") as {
      documents: Array<{ id: string; title: string; documentDir: string }>;
    };
    expect(catalog.documents).toHaveLength(1);
    expect(catalog.documents[0]).toMatchObject({
      id: "doc-a",
      title: "Lease",
      documentDir: `${Sandbox.DocumentsMountPath}/doc-a`,
    });

    const exec = client.execCalls[0];
    expect(exec?.command.startsWith("bash '/tmp/baindar-")).toBe(true);
    expect(exec?.options?.cwd).toBe("/workspace");
    expect(exec?.options?.timeout).toBe(5_000);
    expect(exec?.options?.env).toMatchObject({
      BAINDAR_DOCUMENTS_DIR: Sandbox.DocumentsMountPath,
      BAINDAR_CATALOG: Sandbox.CatalogPath,
    });
  });

  it("validates bash timeout bounds", async () => {
    await expect(
      runtime.runAs(userA, () => Sandbox.runBash(userA, { command: "pwd", timeoutMs: 999 })),
    ).rejects.toThrow();
  });
});
