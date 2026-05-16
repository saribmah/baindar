import { Config } from "../config/config";

// AES-GCM at rest for user-supplied API keys. The master key comes from
// PROVIDER_ENCRYPTION_KEY (base64-encoded 32 bytes). Each ciphertext stores
// its own 12-byte IV prepended to the encrypted payload, so re-encrypting
// the same plaintext produces fresh bytes — no deterministic leakage.
//
// We intentionally do NOT key-derive via PBKDF2/HKDF here: the master key
// is already 256 bits of high-entropy material from `openssl rand -base64`,
// and we only have one user per key, so KDF would be ceremony without
// security benefit.

const IV_LENGTH_BYTES = 12;
const ALGORITHM = "AES-GCM" as const;

const importMasterKey = async (): Promise<CryptoKey> => {
  const raw = Config.requireProviderEncryptionKey();
  const bytes = base64Decode(raw);
  if (bytes.byteLength !== 32) {
    throw new Error(
      `PROVIDER_ENCRYPTION_KEY must decode to 32 bytes (got ${bytes.byteLength}). ` +
        `Generate with: openssl rand -base64 32`,
    );
  }
  return crypto.subtle.importKey(
    "raw",
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    ALGORITHM,
    false,
    ["encrypt", "decrypt"],
  );
};

export const encryptApiKey = async (plaintext: string): Promise<Uint8Array> => {
  const key = await importMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const out = new Uint8Array(IV_LENGTH_BYTES + ciphertext.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ciphertext), IV_LENGTH_BYTES);
  return out;
};

export const decryptApiKey = async (sealed: Uint8Array): Promise<string> => {
  if (sealed.byteLength <= IV_LENGTH_BYTES) {
    throw new Error("encrypted payload too short to contain IV + ciphertext");
  }
  const key = await importMasterKey();
  const iv = sealed.slice(0, IV_LENGTH_BYTES);
  const ciphertext = sealed.slice(IV_LENGTH_BYTES);
  const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
};

export const lastFourOf = (apiKey: string): string => {
  const trimmed = apiKey.trim();
  return trimmed.length <= 4 ? trimmed : trimmed.slice(-4);
};

const base64Decode = (input: string): Uint8Array => {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};
