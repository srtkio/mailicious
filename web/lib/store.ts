// Campus data in Supabase, over its REST API. Server only. Stores no mail text. If Supabase is missing or down,
// checks carry on without it.
import { isDna } from "./dna";
import { COLLEGE_DOMAIN, FREE_MAIL, isOn, registrable } from "./engine";

const TIMEOUT_MS = 2500;
const CACHE_MS = 60_000;

const config = () => {
  const [url, key] = [process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY];
  return url && key ? { url, key } : null;
};

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  const c = config();
  if (!c) throw new Error("Supabase isn't set up");
  const res = await fetch(`${c.url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: c.key, authorization: `Bearer ${c.key}`, "content-type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res;
}

// What a report is about. Free mail and college accounts are shared domains, so only that one address can be judged.
export function reportTarget(sender: string): string | null {
  const address = sender.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 320) return null;
  const host = address.split("@").pop()!;
  return isSharedDomain(host) ? address : registrable(host);
}

export const isSharedDomain = (host: string) => isOn(host, [...FREE_MAIL, COLLEGE_DOMAIN]);

type Verdicts = { fake: string[]; genuine: string[]; scripts: string[] }; // scripts: the Scam DNA of senders marked fake
let verdicts: Verdicts & { at: number } = { at: 0, fake: [], genuine: [], scripts: [] };
let decidedAt = new Map<string, string | undefined>(); // fake sender -> when it was marked

export async function campusVerdicts(): Promise<Verdicts> {
  if (!config() || Date.now() - verdicts.at < CACHE_MS) return verdicts;
  try {
    const rows: { target: string; verdict: string; updated_at?: string }[] = await (await rest("verdicts?select=target,verdict,updated_at")).json();
    const of = (kind: string) => rows.filter((r) => r.verdict === kind).map((r) => r.target);
    verdicts = { ...verdicts, at: Date.now(), fake: of("fake"), genuine: of("genuine") };
    decidedAt = new Map(rows.filter((r) => r.verdict === "fake").map((r) => [r.target, r.updated_at]));
  } catch (e) {
    console.error("campusVerdicts failed:", e);
    return verdicts;
  }
  // Fetched apart, so a failure here can't cost the blocklist above.
  try {
    const reported: { target: string; dna: unknown; created_at?: string }[] = await (await rest("reports?select=target,dna,created_at&dna=not.is.null&order=id.desc&limit=2000")).json();
    verdicts.scripts = topScripts(reported, decidedAt);
  } catch (e) {
    console.error("campus scripts failed:", e);
  }
  return verdicts;
}

const SCRIPTS_PER_SENDER = 2; // a scammer reuses a script, so one verdict can never bless a flood of fingerprints

// The most-reported fingerprints of each fake sender. Only reports made before the verdict count, or a scammer could flood new ones to push their real script off the list.
export function topScripts(reported: { target: string; dna: unknown; created_at?: string }[], fake: Map<string, string | undefined>): string[] {
  const tally = new Map<string, Map<string, number>>();
  for (const { target, dna, created_at } of reported) {
    if (!isDna(dna) || !fake.has(target)) continue;
    const decided = fake.get(target);
    if (decided && created_at && Date.parse(created_at) > Date.parse(decided)) continue;
    const counts = tally.get(target) ?? new Map<string, number>();
    tally.set(target, counts.set(dna, (counts.get(dna) ?? 0) + 1));
  }
  const top = [...tally.values()].flatMap((counts) => [...counts].sort((a, b) => b[1] - a[1]).slice(0, SCRIPTS_PER_SENDER).map(([dna]) => dna));
  return [...new Set(top)];
}

export async function logEvent(level: string, attack: string | null): Promise<void> {
  if (!config()) return;
  await rest("events", { method: "POST", body: JSON.stringify({ level, attack }) }).catch((e) => console.error("logEvent failed:", e));
}

export async function addReport(target: string, level: string | null, attack: string | null, dna: string | null = null): Promise<void> {
  await rest("reports", { method: "POST", body: JSON.stringify({ target, level, attack, dna }) });
}

export async function setVerdict(target: string, verdict: "fake" | "genuine"): Promise<void> {
  await rest("verdicts?on_conflict=target", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ target, verdict, updated_at: new Date().toISOString() }),
  });
  verdicts.at = 0; // this instance sees the change at once; others within a minute
}

const RADAR_CACHE_MS = 30_000;
let radarCache: { at: number; value: Pick<Dashboard, "checked" | "flagged" | "attacks"> & { blocked: number } } | null = null;

// Public totals, cached so page views can't hammer the database.
export async function radar() {
  if (radarCache && Date.now() - radarCache.at < RADAR_CACHE_MS) return radarCache.value;
  const { checked, flagged, attacks, verdicts: decided } = await dashboard();
  const value = { checked, flagged, blocked: decided.filter((v) => v.verdict === "fake").length, attacks: attacks.slice(0, 5) };
  radarCache = { at: Date.now(), value };
  return value;
}

export type Dashboard = {
  checked: number;
  flagged: number;
  attacks: { name: string; count: number }[];
  queue: { target: string; count: number; attack: string | null; latest: string; script: boolean }[]; // script: marking this fake also blocks its Scam DNA
  verdicts: { target: string; verdict: string }[];
};

// shortcut: counts the latest 2000 events in code. Use SQL views if a campus outgrows that.
export async function dashboard(): Promise<Dashboard> {
  const [events, reports, verdicts] = await Promise.all([
    rest("events?select=level,attack&order=id.desc&limit=2000").then((r) => r.json() as Promise<{ level: string; attack: string | null }[]>),
    rest("reports?select=target,attack,created_at,dna&order=id.desc&limit=500").then((r) => r.json() as Promise<{ target: string; attack: string | null; created_at: string; dna?: string | null }[]>),
    rest("verdicts?select=target,verdict&order=updated_at.desc").then((r) => r.json() as Promise<{ target: string; verdict: string }[]>),
  ]);
  const count = new Map<string, number>();
  for (const e of events) if (e.attack) count.set(e.attack, (count.get(e.attack) ?? 0) + 1);
  const decided = new Set(verdicts.map((v) => v.target));
  const queue = new Map<string, Dashboard["queue"][number]>();
  for (const r of reports) {
    if (decided.has(r.target)) continue;
    const row = queue.get(r.target);
    if (row) {
      row.count++;
      row.script ||= !!r.dna;
    } else queue.set(r.target, { target: r.target, count: 1, attack: r.attack, latest: r.created_at, script: !!r.dna });
  }
  return {
    checked: events.length,
    flagged: events.filter((e) => e.level !== "low").length,
    attacks: [...count].map(([name, n]) => ({ name, count: n })).sort((a, b) => b.count - a.count),
    queue: [...queue.values()].sort((a, b) => b.count - a.count),
    verdicts,
  };
}
