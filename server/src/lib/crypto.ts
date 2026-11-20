import { createHash } from "node:crypto";
import argon2 from "argon2";

export function md5(input: string): string {
  return createHash("md5").update(input, "utf8").digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

/**
 * Verifies a last.fm Web Service 2.0 `api_sig`: every param except
 * `api_sig` and `format`, sorted by key, concatenated as key+value,
 * secret appended, then md5'd.
 */
export function verifyApiSig(
  params: Record<string, string | undefined>,
  secret: string
): boolean {
  const sig = params.api_sig;
  if (!sig) return false;
  const keys = Object.keys(params)
    .filter((k) => k !== "api_sig" && k !== "format" && params[k] !== undefined)
    .sort();
  const base = keys.map((k) => `${k}${params[k]}`).join("") + secret;
  return md5(base) === sig;
}
