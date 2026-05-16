import { KEYCHAIN_ACCOUNT, KEYCHAIN_SERVICE } from "../shared/rpc";

// macOS Keychain wrapper for the bearer session token. Uses the bundled
// `security` CLI (always present on macOS) rather than FFI into the
// Security framework — keeps the v1 surface small at the cost of passing
// the token through argv. The token is sensitive but short-lived; for v1
// on a single-user mac that tradeoff is acceptable. Move to FFI if we ever
// ship on shared/multi-user macs.
//
// Codesign note: an unsigned binary writes Keychain entries without ACLs,
// so any process running as the same user can read them via `security
// find-generic-password`. Once we codesign + notarize the bundle, the OS
// scopes the entry to the signed identity, which is the real win for this
// pathway. Treat this module as "better than in-memory" until then.

const runSecurity = async (
  args: string[],
  options: { ignoreNotFound?: boolean } = {},
): Promise<{ stdout: string; code: number }> => {
  const proc = Bun.spawn(["security", ...args], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  if (code !== 0) {
    // Exit code 44 is "item not found" — that's a normal hydration miss
    // on first launch, not an error to surface.
    if (options.ignoreNotFound && code === 44) {
      return { stdout: "", code };
    }
    throw new Error(`security ${args[0]} failed (code ${code}): ${stderr.trim() || stdout.trim()}`);
  }
  return { stdout, code };
};

export const getKeychainToken = async (): Promise<string | null> => {
  const result = await runSecurity(
    ["find-generic-password", "-a", KEYCHAIN_ACCOUNT, "-s", KEYCHAIN_SERVICE, "-w"],
    { ignoreNotFound: true },
  );
  if (result.code !== 0) return null;
  const token = result.stdout.trim();
  return token.length > 0 ? token : null;
};

export const setKeychainToken = async (token: string): Promise<void> => {
  if (!token) throw new Error("setKeychainToken requires a non-empty token.");
  // `-U` updates in place if an entry with the same service+account exists,
  // which is the common case across re-signs and refresh-token rotations.
  await runSecurity([
    "add-generic-password",
    "-U",
    "-a",
    KEYCHAIN_ACCOUNT,
    "-s",
    KEYCHAIN_SERVICE,
    "-w",
    token,
  ]);
};

export const clearKeychainToken = async (): Promise<void> => {
  await runSecurity(["delete-generic-password", "-a", KEYCHAIN_ACCOUNT, "-s", KEYCHAIN_SERVICE], {
    ignoreNotFound: true,
  });
};
