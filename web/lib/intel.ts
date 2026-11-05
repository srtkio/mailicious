// Threat intelligence about domains and links. Server only. Asks public registries and reputation services,
// never the scammer's own site. Any lookup that fails is shown as skipped and adds no flags.
import { COLLEGE_DOMAIN, COMPANIES, FREE_MAIL, hostOf, isOn, registrable, SHORTENERS } from "./engine";
import type { Flag, SecurityCheck } from "./types";

const TIMEOUT_MS = 4000;
const NEW_DAYS = 30;
const YOUNG_DAYS = 180;
const MAX_DOMAINS = 3;
const KNOWN_SAFE = [...Object.values(COMPANIES).flat(), ...FREE_MAIL, COLLEGE_DOMAIN, "google.com", "gle", "forms.gle", ...SHORTENERS];

async function getJson(url: string, init?: RequestInit): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`${new URL(url).hostname} ${res.status}`);
  return res.json();
}

export async function domainAgeDays(domain: string): Promise<number | null> {
  const data = await getJson(`https://rdap.org/domain/${encodeURIComponent(domain)}`);
  const made = data.events?.find((e: { eventAction: string }) => e.eventAction === "registration")?.eventDate;
  return made ? Math.floor((Date.now() - new Date(made).getTime()) / 86_400_000) : null;
}

const dns = async (name: string, type: string) => (await getJson(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`)).Answer ?? [];

async function senderIntel(domain: string): Promise<{ flags: Flag[]; checks: SecurityCheck[] }> {
  const flags: Flag[] = [];
  const checks: SecurityCheck[] = [];
  const [age, mx, dmarc] = await Promise.allSettled([domainAgeDays(domain), dns(domain, "MX"), dns(`_dmarc.${domain}`, "TXT")]);

  if (age.status === "fulfilled" && age.value !== null) {
    const days = age.value;
    if (days < NEW_DAYS) flags.push({ code: "NEW_DOMAIN", level: "high", text: `${domain} was registered only ${days} days ago.` });
    else if (days < YOUNG_DAYS) flags.push({ code: "NEW_DOMAIN", level: "medium", text: `${domain} is only about ${Math.round(days / 30)} months old.` });
    checks.push({ label: "Domain age", status: days < NEW_DAYS ? "fail" : days < YOUNG_DAYS ? "warn" : "pass", detail: days >= 365 ? `${domain} is about ${Math.floor(days / 365)} years old.` : `${domain} is ${days} days old.` });
  } else {
    checks.push({ label: "Domain age", status: "skip", detail: `Couldn't find when ${domain} was registered.` });
  }
  if (mx.status === "fulfilled") {
    if (!mx.value.length) flags.push({ code: "NO_MAIL_SERVER", level: "medium", text: `${domain} isn't set up to receive mail, which real companies always are.` });
    checks.push({ label: "Mail server", status: mx.value.length ? "pass" : "fail", detail: mx.value.length ? `${domain} has a working mail server.` : `${domain} has no mail server.` });
  }
  if (dmarc.status === "fulfilled") {
    const has = dmarc.value.some((r: { data: string }) => /v=DMARC1/i.test(r.data));
    checks.push({ label: "Anti-spoofing policy", status: has ? "pass" : "warn", detail: has ? `${domain} publishes a DMARC policy.` : `${domain} has no DMARC policy, so it's easy to fake.` });
  }
  return { flags, checks };
}

async function safeBrowsing(urls: string[]): Promise<string[]> {
  const key = process.env.SAFE_BROWSING_API_KEY;
  if (!key) throw new Error("no key");
  const data = await getJson("https://safebrowsing.googleapis.com/v4/threatMatches:find", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      client: { clientId: "placementshield", clientVersion: "1.0" },
      threatInfo: {
        threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"],
        platformTypes: ["ANY_PLATFORM"],
        threatEntryTypes: ["URL"],
        threatEntries: urls.map((url) => ({ url })),
      },
    }),
  });
  return (data.matches ?? []).map((m: { threat: { url: string } }) => m.threat.url);
}

async function virusTotal(domain: string): Promise<number> {
  const key = process.env.VIRUSTOTAL_API_KEY;
  if (!key) throw new Error("no key");
  const data = await getJson(`https://www.virustotal.com/api/v3/domains/${encodeURIComponent(domain)}`, { headers: { "x-apikey": key } });
  return data.data?.attributes?.last_analysis_stats?.malicious ?? 0;
}

async function linkIntel(urls: string[]): Promise<{ flags: Flag[]; checks: SecurityCheck[] }> {
  if (!urls.length) return { flags: [], checks: [{ label: "Link reputation", status: "skip", detail: "This mail has no links to check." }] };
  // Paths are kept and queries dropped, so a personal token in a link isn't sent to a third party.
  const clean = [...new Set(urls.flatMap((u) => { try { const p = new URL(/^https?:/i.test(u) ? u : `https://${u}`); return [p.origin + p.pathname]; } catch { return []; } }))].slice(0, 20);
  const unknown = [...new Set(clean.map((u) => registrable(hostOf(u) ?? "")).filter((d) => d && !isOn(d, KNOWN_SAFE)))];
  const domains = unknown.slice(0, MAX_DOMAINS);
  const [sb, ...vt] = await Promise.allSettled([safeBrowsing(clean), ...domains.map(virusTotal)]);

  const flags: Flag[] = [];
  const listed = sb.status === "fulfilled" ? (sb.value as string[]) : [];
  const counted = vt.flatMap((v) => (v.status === "fulfilled" ? [v.value as number] : []));
  const detections = Math.max(0, ...counted);
  if (listed.length) flags.push({ code: "KNOWN_MALICIOUS", level: "high", text: `Google Safe Browsing lists ${hostOf(listed[0])} as dangerous.` });
  if (detections >= 2) flags.push({ code: "KNOWN_MALICIOUS", level: "high", text: `${detections} security vendors on VirusTotal flag a link in this mail as malicious.` });
  const vtOn = !!process.env.VIRUSTOTAL_API_KEY;
  if (vtOn && unknown.length > domains.length) flags.push({ code: "LINK_NOT_CHECKED", level: "medium", text: `This mail links to ${unknown.length} unfamiliar sites, too many to check them all.` });
  const ran = sb.status === "fulfilled" || counted.length > 0;
  const partial = vtOn && counted.length < domains.length;
  const danger = flags.find((f) => f.code === "KNOWN_MALICIOUS");
  const checks: SecurityCheck[] = [
    danger
      ? { label: "Link reputation", status: "fail", detail: danger.text }
      : !ran
        ? { label: "Link reputation", status: "skip", detail: "Reputation services weren't available for this check." }
        : flags.length || partial
          ? { label: "Link reputation", status: "warn", detail: "Nothing is on the blocklists, but some links couldn't be checked." }
          : { label: "Link reputation", status: "pass", detail: "No link is on the blocklists we checked." },
  ];
  return { flags, checks };
}

export async function threatIntel(sender: string, links: string[]): Promise<{ flags: Flag[]; checks: SecurityCheck[] }> {
  const host = sender.includes("@") ? sender.trim().toLowerCase().split("@").pop()! : "";
  const domain = host && registrable(host);
  const lookups = [linkIntel(links)];
  if (domain && !isOn(domain, KNOWN_SAFE)) lookups.unshift(senderIntel(domain));
  const done = await Promise.all(lookups);
  return { flags: done.flatMap((d) => d.flags), checks: done.flatMap((d) => d.checks) };
}
