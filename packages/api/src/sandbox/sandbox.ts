import type {
  ExecOptions,
  ExecResult,
  MountBucketOptions,
  Sandbox as CloudflareSandbox,
} from "@cloudflare/sandbox";
import { z } from "zod";
import { Config } from "../config/config";
import { Instance } from "../instance";

export namespace Sandbox {
  export const DocumentsMountPath = "/mnt/baindar/documents";

  const outputLimit = 20_000;
  const defaultTimeoutMs = 30_000;

  export const RunBashInput = z.object({
    command: z
      .string()
      .min(1)
      .max(12_000)
      .describe("Bash command or script body to execute in the user's prepared sandbox."),
    timeoutMs: z.number().int().min(1_000).max(120_000).optional(),
  });
  export type RunBashInput = z.infer<typeof RunBashInput>;

  export const RunBashResult = z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number().int(),
    success: z.boolean(),
    duration: z.number().nonnegative(),
    truncated: z.boolean(),
  });
  export type RunBashResult = z.infer<typeof RunBashResult>;

  export type Client = {
    mountBucket(bucket: string, mountPath: string, options: MountBucketOptions): Promise<void>;
    mkdir(path: string, options?: { recursive?: boolean }): Promise<unknown>;
    writeFile(
      path: string,
      content: string | ReadableStream<Uint8Array>,
      options?: { encoding?: string },
    ): Promise<unknown>;
    exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  };

  type ClientFactory = (sandboxId: string) => Client | Promise<Client>;

  let clientFactoryForTests: ClientFactory | null = null;

  export const setClientFactoryForTests = (factory: ClientFactory): (() => void) => {
    clientFactoryForTests = factory;
    return () => {
      if (clientFactoryForTests === factory) clientFactoryForTests = null;
    };
  };

  export const sandboxIdForUser = (userId: string): string => `user-${userId}`;

  export const prepareForUser = async (userId: string): Promise<void> => {
    const client = await getClient(userId);
    await client.mkdir("/mnt/baindar", { recursive: true });
    try {
      await client.mountBucket(
        Config.requireSandboxR2BucketName(),
        DocumentsMountPath,
        mountOptionsForUser(userId),
      );
    } catch (error) {
      if (!isAlreadyMountedError(error)) throw error;
    }
  };

  export const runBash = async (userId: string, input: RunBashInput): Promise<RunBashResult> => {
    const parsed = RunBashInput.parse(input);
    const client = await getClient(userId);
    await prepareForUser(userId);

    const scriptPath = `/tmp/baindar-${crypto.randomUUID()}.sh`;
    await client.writeFile(scriptPath, `#!/usr/bin/env bash\n${parsed.command}\n`);

    const result = await client.exec(`bash ${shellQuote(scriptPath)}`, {
      cwd: "/workspace",
      timeout: parsed.timeoutMs ?? defaultTimeoutMs,
      env: {
        BAINDAR_DOCUMENTS_DIR: DocumentsMountPath,
        PYTHONUNBUFFERED: "1",
      },
    });
    const stdout = truncateOutput(result.stdout);
    const stderr = truncateOutput(result.stderr);
    return RunBashResult.parse({
      stdout: stdout.value,
      stderr: stderr.value,
      exitCode: result.exitCode,
      success: result.success,
      duration: result.duration,
      truncated: stdout.truncated || stderr.truncated,
    });
  };

  const getClient = async (userId: string): Promise<Client> => {
    const sandboxId = sandboxIdForUser(userId);
    if (clientFactoryForTests) return clientFactoryForTests(sandboxId);
    const { getSandbox } = await import("@cloudflare/sandbox");
    return getSandbox(Instance.env.Sandbox, sandboxId);
  };

  const mountOptionsForUser = (userId: string): MountBucketOptions => {
    const prefix = `/users/${userId}/documents/`;
    if (Config.isSandboxR2Local()) {
      return { localBucket: true, prefix, readOnly: true };
    }
    return {
      endpoint: Config.requireSandboxR2Endpoint(),
      provider: "r2",
      credentials: Config.requireSandboxR2Credentials(),
      prefix,
      readOnly: true,
    };
  };

  const isAlreadyMountedError = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();
    return (
      normalized.includes("already mounted") ||
      normalized.includes("path already mounted") ||
      normalized.includes("mount path already in use") ||
      (normalized.includes("mount path") && normalized.includes("already in use"))
    );
  };

  const truncateOutput = (value: string): { value: string; truncated: boolean } => {
    if (value.length <= outputLimit) return { value, truncated: false };
    return { value: `${value.slice(0, outputLimit)}\n[truncated]`, truncated: true };
  };

  const shellQuote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;
}
