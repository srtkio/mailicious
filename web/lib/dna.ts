// Scam DNA: a 64-bit fingerprint of a mail's script (SimHash over its words and word pairs).
// Swapping a name, an amount, a link or the sender barely moves it. The mail can't be rebuilt from it, so it's safe to store.

const STOP = new Set(
  "the and for that this with from your you are was were have has had will would can could should our their they them his her its not but all any been being into about over more than then there here what when which who whom how why also just very only some such each other out use using via per please dear hello regards thanks thank sir madam team".split(" "),
);
// Every placement mail uses these, so they say nothing about which script this is.
const SHARED = new Set("internship internships intern interns job jobs offer offers candidate candidates student students selected shortlisted placement placements company companies hiring interview interviews role roles position positions salary stipend apply application applications career careers campus college office profile opportunity opening openings summer recruitment".split(" "));
const MIN_FEATURES = 20; // too few words and every short mail starts to look alike
const WORD_WEIGHT = 3; // a reworded mail keeps its words longer than their exact order
const MAX_WORDS = 800;
const BITS = 64;
const MASK = (1n << 64n) - 1n;

// How close two fingerprints must be to count as one script. Every pair of unrelated test mails is further apart than this: dna.test.ts enforces it.
export const SAME_SCRIPT_BITS = 14;

// What the mail says once invisible tricks are gone. The rules read this too, so both see the same words.
export const canonical = (text: string, gap = "") =>
  text
    .normalize("NFKC") // full-width and styled letters read as plain ones
    .replace(/\p{Cf}/gu, gap); // zero-width characters hide inside words, or stand in for the spaces between them

function words(text: string): string[] {
  return canonical(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}@.:/+_-]+/u) // any other symbol separates words, so glued text still splits
    .map((w) => w.replace(/[\w.+-]{1,64}@[\w.-]{1,255}|https?:\S{0,2000}|www\.\S{0,2000}/g, " ")) // links and addresses are what scammers swap first
    .join(" ")
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !SHARED.has(w))
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
  const pairs = list.slice(1).map((w, i) => `${list[i]} ${w}`);
  if (list.length + pairs.length < MIN_FEATURES) return null;
  const tally = new Array<number>(BITS).fill(0);
  const count = (feature: string, weight: number) => {
    const h = hash(feature);
    for (let bit = 0; bit < BITS; bit++) tally[bit] += (h >> BigInt(bit)) & 1n ? weight : -weight;
  };
  for (const w of list) count(w, WORD_WEIGHT);
  for (const p of pairs) count(p, 1);
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
