import { checkCompany, extractClaims, signalFlags } from "@/lib/ai";
import { checkRules, claimedCompany, deepRules, findLinks } from "@/lib/engine";
import { analyzeHeaders, parseRawMail } from "@/lib/headers";
import { threatIntel } from "@/lib/intel";
import { checkLinks } from "@/lib/links";
import { securityReport } from "@/lib/report";
import type { CheckRequest } from "@/lib/types";

const MAX_TEXT = 20_000;
const MAX_LINKS = 20;
const MAX_RAW = 1_000_000;
const MAX_HEADERS = 64_000;

const AI_PER_MINUTE = 20;
const AI_BUDGET_MS = 15_000; // model retries can stack past 45s when Gemini is busy, and a worried student won't wait
const aiCalls = new Map<string, { count: number; start: number }>();

// Over the limit means rules and link checks only, never an error: a whole campus can share one IP.
// shortcut: counts per server instance, so it slows abuse rather than stopping it; move to Supabase or Redis if quotas drain.
function underAiLimit(ip: string): boolean {
  const now = Date.now();
  const entry = aiCalls.get(ip);
  if (!entry || now - entry.start > 60_000) {
    if (aiCalls.size > 5000) aiCalls.clear();
    aiCalls.set(ip, { count: 1, start: now });
    return true;
  }
  return ++entry.count <= AI_PER_MINUTE;
}

const isStrings = (v: unknown, count: number, length: number) => Array.isArray(v) && v.length <= count && v.every((x) => typeof x === "string" && x.length <= length);

export async function POST(request: Request) {
  let body: CheckRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const input = body ?? {};
  const { links = [], attachments = [], raw } = input;
  if (raw !== undefined && (typeof raw !== "string" || raw.length > MAX_RAW)) return Response.json({ error: "raw must be a mail under 1 MB" }, { status: 413 });
  if (typeof input.headers === "string" ? input.headers.length > MAX_HEADERS : input.headers !== undefined) return Response.json({ error: "headers are too long" }, { status: 413 });
  if (!isStrings(links, MAX_LINKS, 2000)) return Response.json({ error: `links must be up to ${MAX_LINKS} strings` }, { status: 400 });
  if (!isStrings(attachments, 20, 300)) return Response.json({ error: "attachments must be up to 20 file names" }, { status: 400 });
  const pairsOk = input.linkPairs === undefined || (Array.isArray(input.linkPairs) && input.linkPairs.length <= MAX_LINKS * 3 && input.linkPairs.every((l) => typeof l?.href === "string" && l.href.length <= 2000 && typeof l?.text === "string" && l.text.length <= 500));
  if (!pairsOk) return Response.json({ error: "linkPairs is invalid" }, { status: 400 });

  const parsed = raw ? parseRawMail(raw) : null;
  const text = parsed?.text.slice(0, MAX_TEXT) ?? input.text;
  if (typeof text !== "string" || !text.trim()) return Response.json({ error: "text is required" }, { status: 400 });
  if (text.length > MAX_TEXT) return Response.json({ error: `text is over ${MAX_TEXT} characters` }, { status: 413 });
  if (input.sender !== undefined && (typeof input.sender !== "string" || input.sender.length > 320)) return Response.json({ error: "sender must be an email address" }, { status: 400 });

  const headerBlock = parsed?.headers ?? input.headers;
  const headers = headerBlock ? analyzeHeaders(headerBlock.slice(0, MAX_HEADERS)) : null;
  const sender = input.sender || headers?.from || "";
  const linkPairs = [...(input.linkPairs ?? []), ...(parsed?.linkPairs ?? [])].slice(0, MAX_LINKS * 3);
  const files = [...attachments, ...(parsed?.attachments ?? [])];
  const allLinks = [...new Set([...findLinks(text, links), ...linkPairs.map((l) => l.href)])].slice(0, MAX_LINKS);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const deadline = new Promise<null>((resolve) => setTimeout(() => resolve(null), AI_BUDGET_MS));
  const claims = underAiLimit(ip) ? await Promise.race([extractClaims(text, sender), deadline]) : null;
  const seed = claimedCompany(text);
  const lookup = claims && { ...claims, company: claims.company ?? seed ?? null };
  const [company, linkFlags, intel] = await Promise.all([
    lookup ? Promise.race([checkCompany(lookup, sender, seed), deadline]) : null,
    checkLinks(text, allLinks, seed ?? claims?.company ?? undefined),
    threatIntel(sender, allLinks).catch(() => ({ flags: [], checks: [] })),
  ]);
  const extra = [
    ...signalFlags(claims?.signals ?? []),
    ...(company?.flags ?? []),
    ...linkFlags,
    ...(headers?.flags ?? []),
    ...intel.flags,
    ...deepRules({ sender, links: allLinks, linkPairs, attachments: files }),
  ];
  const result = checkRules(text, sender, allLinks, [], extra);

  return Response.json({
    ...result,
    evidence: { ...result.evidence, company: company?.summary ?? null },
    sources: company?.sources ?? [],
    checks: securityReport(result.flags, [...(headers?.checks ?? []), ...intel.checks], { sender: !!sender, links: allLinks.length > 0, headers: !!headers }),
    mode: lookup && (company || (!lookup.company && !lookup.rejected)) ? "full" : "limited", // no company anywhere means nothing to look up, not a failure
  });
}
