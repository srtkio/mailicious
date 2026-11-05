// Campus data in Supabase, over its REST API. Server only. Stores no mail text. If Supabase is missing or down,
// checks carry on without it.
import { FREE_MAIL, COLLEGE_DOMAIN, registrable } from "./engine";

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
  return FREE_MAIL.includes(host) || host === COLLEGE_DOMAIN || host.endsWith(`.${COLLEGE_DOMAIN}`) ? address : registrable(host);
}

let blocked: { at: number; targets: string[] } = { at: 0, targets: [] };

export async function blockedTargets(): Promise<string[]> {
  if (!config() || Date.now() - blocked.at < CACHE_MS) return blocked.targets;
  try {
    const rows: { target: string }[] = await (await rest("verdicts?select=target&verdict=eq.fake")).json();
    blocked = { at: Date.now(), targets: rows.map((r) => r.target) };
  } catch (e) {
    console.error("blockedTargets failed:", e);
  }
  return blocked.targets;
}

export async function logEvent(level: string, attack: string | null): Promise<void> {
  if (!config()) return;
  await rest("events", { method: "POST", body: JSON.stringify({ level, attack }) }).catch((e) => console.error("logEvent failed:", e));
}

export async function addReport(target: string, level: string | null, attack: string | null): Promise<void> {
  await rest("reports", { method: "POST", body: JSON.stringify({ target, level, attack }) });
}

export async function setVerdict(target: string, verdict: "fake" | "genuine"): Promise<void> {
  await rest("verdicts?on_conflict=target", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ target, verdict, updated_at: new Date().toISOString() }),
  });
  blocked = { at: 0, targets: [] }; // this instance sees the change at once; others within a minute
}

export type Dashboard = {
  checked: number;
  flagged: number;
  attacks: { name: string; count: number }[];
  queue: { target: string; count: number; attack: string | null; latest: string }[];
  verdicts: { target: string; verdict: string }[];
};

// shortcut: counts the latest 2000 events in code. Use SQL views if a campus outgrows that.
export async function dashboard(): Promise<Dashboard> {
  const [events, reports, verdicts] = await Promise.all([
    rest("events?select=level,attack&order=id.desc&limit=2000").then((r) => r.json() as Promise<{ level: string; attack: string | null }[]>),
    rest("reports?select=target,attack,created_at&order=id.desc&limit=500").then((r) => r.json() as Promise<{ target: string; attack: string | null; created_at: string }[]>),
    rest("verdicts?select=target,verdict&order=updated_at.desc").then((r) => r.json() as Promise<{ target: string; verdict: string }[]>),
  ]);
  const count = new Map<string, number>();
  for (const e of events) if (e.attack) count.set(e.attack, (count.get(e.attack) ?? 0) + 1);
  const decided = new Set(verdicts.map((v) => v.target));
  const queue = new Map<string, Dashboard["queue"][number]>();
  for (const r of reports) {
    if (decided.has(r.target)) continue;
    const row = queue.get(r.target);
    if (row) row.count++;
    else queue.set(r.target, { target: r.target, count: 1, attack: r.attack, latest: r.created_at });
  }
  return {
    checked: events.length,
    flagged: events.filter((e) => e.level !== "low").length,
    attacks: [...count].map(([name, n]) => ({ name, count: n })).sort((a, b) => b.count - a.count),
    queue: [...queue.values()].sort((a, b) => b.count - a.count),
    verdicts,
  };
}
