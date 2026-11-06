// Server only. Vouches that a fingerprint came from a mail the engine itself flagged, from this sender.
// Without it, anyone could report a fake sender with a real mail's fingerprint, and that real mail would start to look like a scam.
import { createHmac, timingSafeEqual } from "node:crypto";

const secret = () => process.env.SUPABASE_SECRET_KEY;
const sign = (key: string, dna: string, target: string) => createHmac("sha256", `scam-dna:${key}`).update(`${dna}|${target}`).digest();

export function dnaToken(dna: string, target: string): string | null {
  const key = secret();
  return key ? sign(key, dna, target).toString("hex") : null;
}

export function dnaTokenOk(token: unknown, dna: string, target: string): boolean {
  const key = secret();
  if (!key || typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return false;
  return timingSafeEqual(Buffer.from(token, "hex"), sign(key, dna, target));
}
