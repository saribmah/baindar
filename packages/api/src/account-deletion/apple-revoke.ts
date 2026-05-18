import { Config } from "../config/config";

// Apple Sign in with Apple token revocation.
//
// Apple's account-deletion guidance explicitly requires apps that offer
// Sign in with Apple to call the REST revoke endpoint when a user deletes
// their account. Without it:
//   - Apple does not re-share the user's email on a subsequent sign-in
//     (Apple only shares email on the first authorization per (Apple ID,
//     app)). Since our `account` row is gone after deletion, Better Auth
//     can't recover the email from local state either — the next sign-up
//     fails because `user.email` is NOT NULL.
//   - The app stays listed under iOS Settings → Apple ID → Apps Using
//     Apple ID forever.
//   - The previously-issued refresh token remains exchangeable at Apple.
//
// The revoke call:
//   POST https://appleid.apple.com/auth/revoke
//   Content-Type: application/x-www-form-urlencoded
//   client_id=<Service ID>
//   client_secret=<short-lived ES256 JWT signed by our .p8 key>
//   token=<refresh_token from our account row>
//   token_type_hint=refresh_token
//
// `invalid_grant` (HTTP 400 with that error code) is the response Apple
// returns when the token is already revoked or has expired. The workflow
// treats that as success so retries of this step are safe.
export namespace AppleRevoke {
  const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
  const APPLE_AUDIENCE = "https://appleid.apple.com";
  // Short-lived JWT — only needs to outlive the single fetch. Apple permits
  // up to 6 months but recommends keeping client_secret JWTs short.
  const JWT_LIFETIME_SECONDS = 60 * 5;

  // Revokes a single Apple refresh (or access) token. Returns true if
  // Apple accepted the revoke (200) or treated the token as already gone
  // (invalid_grant), false only when revoke is skipped because the global
  // config isn't set. Throws on any other non-2xx response so the
  // workflow step retries on transient failures.
  export const revokeToken = async (token: string): Promise<boolean> => {
    const config = Config.getAppleRevoke();
    if (!config) return false;

    const clientSecret = await signClientSecret(config);
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: clientSecret,
      token,
      token_type_hint: "refresh_token",
    });

    const response = await fetch(APPLE_REVOKE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });

    if (response.ok) return true;

    // Apple uses 400 + `error: "invalid_grant"` for already-revoked /
    // expired tokens. Treat as success so step retries are idempotent.
    if (response.status === 400) {
      const payload = await response.json().catch(() => ({}) as Record<string, unknown>);
      const errorCode = (payload as Record<string, unknown>).error;
      if (errorCode === "invalid_grant") return true;
    }

    const bodyText = await response.text().catch(() => "");
    throw new Error(`Apple revoke failed: ${response.status} ${response.statusText} ${bodyText}`);
  };

  // Builds the per-request ES256 JWT Apple expects as `client_secret`.
  // Header includes the .p8 key id, payload binds the team id (iss) +
  // service id (sub) + Apple audience.
  const signClientSecret = async (config: Config.AppleRevokeConfig): Promise<string> => {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "ES256", kid: config.keyId, typ: "JWT" };
    const payload = {
      iss: config.teamId,
      iat: now,
      exp: now + JWT_LIFETIME_SECONDS,
      aud: APPLE_AUDIENCE,
      sub: config.clientId,
    };

    const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
    const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const key = await importPrivateKey(config.privateKey);
    const signatureBuf = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      new TextEncoder().encode(signingInput),
    );
    // WebCrypto's ECDSA sign output is already R||S (IEEE P1363), which is
    // the JWS format Apple expects — no DER→P1363 conversion needed.
    const encodedSignature = base64UrlEncode(new Uint8Array(signatureBuf));

    return `${signingInput}.${encodedSignature}`;
  };

  // Parse the PKCS#8 PEM .p8 contents into a CryptoKey. Accepts both:
  //   - real multi-line PEM (newlines preserved)
  //   - single-line variant with literal `\n` sequences (some shells /
  //     wrangler secret put workflows encode it that way)
  export const importPrivateKey = async (pem: string): Promise<CryptoKey> => {
    const normalized = pem.replace(/\\n/g, "\n");
    const base64 = normalized
      .replace(/-----BEGIN [^-]+-----/g, "")
      .replace(/-----END [^-]+-----/g, "")
      .replace(/\s+/g, "");
    const der = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    // `der.buffer` is an ArrayBufferLike across runtimes; the cast keeps
    // the importKey signature happy without losing the underlying bytes.
    return crypto.subtle.importKey(
      "pkcs8",
      der.buffer as ArrayBuffer,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
  };

  // Base64url encoder (no padding) for the JWS segments + signature.
  const base64UrlEncode = (bytes: Uint8Array): string => {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
}
