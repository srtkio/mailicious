// Server only. Vouches that a fingerprint came from this sender and a mail whose own words looked risky, within the last day.
// Without it, anyone could report a fake sender with a real mail's fingerprint, and that real mail would start to look like a scam.
// shortcut: a caller can still get a token by adding scam wording to a real mail. So a match on otherwise clean words only ever says Check first, a person must mark the sender fake first, and marking it genuine undoes it.
import { createHmac, timingSafeEqual } from "node:crypto";

const VALID_MS = 86_400_000;
const SKEW_MS = 60_000; // server instances' clocks can differ a little

const secret = () => process.env.SUPABASE_SECRET_KEY;
const sign = (key: string, dna: string, target: string, at: number) => createHmac("sha256", `scam-dna:${key}`).update(`${dna}|${target}|${at}`).digest();

export function dnaToken(dna: string, target: string, now = Date.now()): string | null {
  const key = secret();
  return key ? `${now}.${sign(key, dna, target, now).toString("hex")}` : null;
}

export function dnaTokenOk(token: unknown, dna: string, target: string, now = Date.now()): boolean {
  const key = secret();
  const parts = typeof token === "string" ? /^(\d{13})\.([0-9a-f]{64})$/.exec(token) : null;
  if (!key || !parts) return false;
  const at = Number(parts[1]);
  if (now - at > VALID_MS || at - now > SKEW_MS) return false;
  return timingSafeEqual(Buffer.from(parts[2], "hex"), sign(key, dna, target, at));
}
