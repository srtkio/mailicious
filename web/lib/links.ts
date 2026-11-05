// Link/form evidence: follows short links and reads Google Forms. Server only, unlike engine.ts.
// Only ever connects to the fixed hosts below, so a scammer's link can't reach internal addresses (SSRF)
// or learn the mail was opened from a hit on a tracking URL. Any failure adds no flags; the rules result stands.
import { claimedCompany, findLinks, hostOf, ID_OR_BANK, isOn, SECRET, SHORTENERS } from "./engine";
import type { Flag } from "./types";

const FETCHABLE = [...SHORTENERS, "forms.gle", "docs.google.com"];
const MAX_LINKS = 5;
const MAX_HOPS = 3;
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 5000;

const parse = (raw: string, base?: URL) => {
  try {
    return new URL(raw, base);
  } catch {
    return null;
  }
};
const isForm = (u: URL) => u.hostname === "docs.google.com" && u.pathname.startsWith("/forms/");
const canFetch = (u: URL) =>
  /^https?:$/.test(u.protocol) && !u.port && !u.username && !u.password && isOn(u.hostname, FETCHABLE) && (u.hostname !== "docs.google.com" || isForm(u));

async function readCapped(res: Response): Promise<string | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks).toString("utf8");
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
}

const strings = (v: unknown): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : []);

// Reads the form's own data blob, not the page text: every Google Form page carries a
// "Never submit passwords" footer, which would flag all of them.
export function parseGoogleForm(html: string): { title: string; text: string } | null {
  const blob = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*([\s\S]*?);\s*<\/script>/)?.[1];
  if (!blob) return null;
  try {
    const title = (html.match(/<title>([^<]*)<\/title>/)?.[1].trim() ?? "").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    return { title, text: strings(JSON.parse(blob)).join("\n") };
  } catch {
    return null;
  }
}

// shortcut: any mention counts, so a form saying "we never ask for your OTP" flags too. Fine for a check that must not miss these.
export function formFlags(form: { title: string; text: string }, company?: string): Flag[] {
  const flags: Flag[] = [];
  const add = (level: Flag["level"], code: string, text: string) => flags.push({ code, level, text });
  const name = form.title.slice(0, 80) || "the linked form";
  if (SECRET.test(form.text)) add("high", "FORM_ASKS_DATA", `The form "${name}" asks for an OTP or password.`);
  if (ID_OR_BANK.test(form.text)) add("high", "FORM_ASKS_DATA", `The form "${name}" asks for ID or bank details.`);
  if (/\b(transaction id|utr|payment|registration fee)\b/i.test(form.text)) add("high", "FORM_ASKS_DATA", `The form "${name}" asks for a payment.`);
  if (company && !new RegExp(`\\b${company}\\b`, "i").test(form.text))
    add("medium", "FORM_MISMATCH", `The mail says ${company[0].toUpperCase() + company.slice(1)}, but the form "${name}" never mentions it.`);
  return flags;
}

async function inspect(start: URL, company: string | undefined): Promise<Flag[]> {
  const signal = AbortSignal.timeout(TIMEOUT_MS); // shared by every hop, so one link costs 5s at most
  const from = hostOf(start.href);
  const shortened = isOn(start.hostname, SHORTENERS);
  const landedOn = (host: string): Flag[] => {
    const h = hostOf(`https://${host}`) ?? host;
    if (!shortened) return [];
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(h)
      ? [{ code: "RAW_IP_LINK", level: "high", text: `The short link ${from} really goes to a bare IP address (${h}).` }]
      : [{ code: "SHORT_LINK_TARGET", level: "medium", text: `The short link ${from} really goes to ${h}.` }];
  };

  let url = start;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (!canFetch(url)) return landedOn(url.hostname);
    url.protocol = "https:";
    const res = await fetch(url, { redirect: "manual", signal, cache: "no-store" });
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel();
      const next = parse(res.headers.get("location") ?? "", url);
      if (!next) return [];
      url = next;
      continue;
    }
    if (!res.ok || !isForm(url)) {
      await res.body?.cancel();
      return [];
    }
    const html = await readCapped(res);
    const form = html && parseGoogleForm(html);
    return [...landedOn(url.hostname), ...(form ? formFlags(form, company) : [])];
  }
  return [];
}

export async function checkLinks(text: string, links: string[] = []): Promise<Flag[]> {
  const company = claimedCompany(text);
  const urls = [...new Set(findLinks(text, links))]
    .map((l) => parse(/^https?:\/\//i.test(l) ? l : `https://${l}`))
    .filter((u): u is URL => !!u && canFetch(u))
    .slice(0, MAX_LINKS);
  const found = await Promise.all(urls.map((u) => inspect(u, company).catch(() => [])));
  return found.flat();
}
