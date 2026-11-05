import { checkCompany, extractClaims, signalFlags } from "@/lib/ai";
import { checkRules, claimedCompany } from "@/lib/engine";
import { checkLinks } from "@/lib/links";
import type { CheckRequest } from "@/lib/types";

const MAX_TEXT = 20_000;
const MAX_LINKS = 20;

const AI_PER_MINUTE = 20;
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

export async function POST(request: Request) {
  let body: CheckRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const { text, sender = "", links = [] } = body ?? {};
  if (typeof text !== "string" || !text.trim()) return Response.json({ error: "text is required" }, { status: 400 });
  if (text.length > MAX_TEXT) return Response.json({ error: `text is over ${MAX_TEXT} characters` }, { status: 413 });
  if (typeof sender !== "string" || sender.length > 320) return Response.json({ error: "sender must be an email address" }, { status: 400 });
  if (!Array.isArray(links) || links.length > MAX_LINKS || links.some((l) => typeof l !== "string" || l.length > 2000))
    return Response.json({ error: `links must be up to ${MAX_LINKS} strings` }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const claims = underAiLimit(ip) ? await extractClaims(text, sender) : null;
  const seed = claimedCompany(text);
  const [company, linkFlags] = await Promise.all([claims ? checkCompany(claims, sender, seed) : null, checkLinks(text, links, seed ?? claims?.company ?? undefined)]);
  const extra = [...signalFlags(claims?.signals ?? []), ...(company?.flags ?? []), ...linkFlags];
  const result = checkRules(text, sender, links, [], extra);

  return Response.json({
    ...result,
    evidence: { ...result.evidence, company: company?.summary ?? null },
    sources: company?.sources ?? [],
    mode: company ? "full" : "limited",
  });
}
