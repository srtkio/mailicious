// Scam DNA: a 64-bit fingerprint of a mail's script (SimHash over its words and word pairs).
// Swapping a name, an amount, a link or the sender barely moves it. The mail can't be rebuilt from it, so it's safe to store.

const STOP = new Set(
  "the and for that this with from your you are was were have has had will would can could should our their they them his her its not but all any been being into about over more than then there here what when which who whom how why also just very only some such each other out use using via per please dear hello regards thanks thank sir madam team".split(" "),
);
const MIN_FEATURES = 24; // too few words and every short mail starts to look alike
const MAX_WORDS = 800;
const BITS = 64;
const MASK = (1n << 64n) - 1n;

// How close two fingerprints must be to count as one script. Every pair of unrelated test mails is further apart than this: dna.test.ts enforces it.
export const SAME_SCRIPT_BITS = 14;

function words(text: string): string[] {
  return text
    .normalize("NFKC") // full-width and styled letters read as plain ones
    .replace(/\p{Cf}/gu, "") // zero-width characters hide inside words
    .toLowerCase()
    .split(/[^\p{L}\p{N}@.:/+_-]+/u) // any other symbol separates words, so one stray @ can't swallow a sentence
    .filter((w) => !w.includes("@") && !/https?:|www\./.test(w)) // links and addresses are what scammers swap first
    .join(" ")
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .slice(0, MAX_WORDS);
}

// FNV-1a, then a mixing step, because plain FNV leaves short strings' high bits barely changed.
function hash(feature: string): bigint {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < feature.length; i++) h = ((h ^ BigInt(feature.charCodeAt(i))) * 0x100000001b3n) & MASK;
  h = ((h ^ (h >> 33n)) * 0xff51afd7ed558ccdn) & MASK;
  h = ((h ^ (h >> 33n)) * 0xc4ceb9fe1a85ec53n) & MASK;
  return h ^ (h >> 33n);
}

export function scamDna(text: string): string | null {
  const list = words(text);
  const features = [...list, ...list.slice(1).map((w, i) => `${list[i]} ${w}`)];
  if (features.length < MIN_FEATURES) return null;
  const tally = new Array<number>(BITS).fill(0);
  for (const f of features) {
    const h = hash(f);
    for (let bit = 0; bit < BITS; bit++) tally[bit] += (h >> BigInt(bit)) & 1n ? 1 : -1;
  }
  let dna = 0n;
  for (let bit = 0; bit < BITS; bit++) if (tally[bit] > 0) dna |= 1n << BigInt(bit);
  return dna.toString(16).padStart(16, "0");
}

export const isDna = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{16}$/.test(v);

export function dnaDistance(a: string, b: string): number {
  let diff = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let bits = 0;
  for (; diff; diff &= diff - 1n) bits++;
  return bits;
}

// The closest known script within reach, as a percentage of matching bits.
export function dnaMatch(dna: string | null, known: string[]): number | null {
  if (!dna || !known.length) return null;
  const closest = Math.min(...known.map((k) => dnaDistance(dna, k)));
  return closest <= SAME_SCRIPT_BITS ? Math.round((1 - closest / BITS) * 100) : null;
}
