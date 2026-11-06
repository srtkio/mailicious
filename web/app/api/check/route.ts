import { checkCompany, extractClaims, signalFlags } from "@/lib/ai";
import { checkRules, claimedCompany, deepRules, findLinks, isJobMail } from "@/lib/engine";
import { analyzeHeaders, parseRawMail } from "@/lib/headers";
import { threatIntel } from "@/lib/intel";
import { checkLinks } from "@/lib/links";
import { securityReport } from "@/lib/report";
import { clientIp, underLimit } from "@/lib/limit";
import { campusVerdicts, logEvent, reportTarget } from "@/lib/store";
import type { CheckRequest, Flag } from "@/lib/types";

const MAX_TEXT = 20_000;
const MAX_LINKS = 20;
const MAX_RAW = 1_000_000;
const MAX_HEADERS = 64_000;

const AI_PER_MINUTE = 20;
const AI_BUDGET_MS = 15_000; // model retries can stack past 45s when Gemini is busy, and a worried student won't wait
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

  const parsed = raw ? await parseRawMail(raw).catch(() => null) : null;
  if (raw && !parsed) return Response.json({ error: "Couldn't read that mail file" }, { status: 400 });
  const text = parsed?.text.slice(0, MAX_TEXT) ?? input.text;
  if (typeof text !== "string" || !text.trim()) return Response.json({ error: "text is required" }, { status: 400 });
  if (text.length > MAX_TEXT) return Response.json({ error: `text is over ${MAX_TEXT} characters` }, { status: 413 });
  if (input.sender !== undefined && (typeof input.sender !== "string" || input.sender.length > 320)) return Response.json({ error: "sender must be an email address" }, { status: 400 });

  const headerBlock = parsed?.headers ?? input.headers;
  const headers = headerBlock ? analyzeHeaders(headerBlock.slice(0, MAX_HEADERS)) : null;
  const sender = input.sender || headers?.from || "";
  // Duplicates count once, so one link repeated can't use up the limit.
  const uniquePairs = [...new Map([...(input.linkPairs ?? []), ...(parsed?.linkPairs ?? [])].map((l) => [`${l.href}\n${l.text}`, l])).values()];
  const linkPairs = uniquePairs.slice(0, MAX_LINKS * 3);
  const files = [...attachments, ...(parsed?.attachments ?? [])];
  // Real link targets come first, so text can't pad them out of the limit.
  const everyLink = [...new Set([...uniquePairs.map((l) => l.href), ...findLinks(parsed?.text ?? text, links)])];
  const allLinks = everyLink.slice(0, MAX_LINKS);
  const unread: Flag[] = [];
  if (parsed?.partial) unread.push({ code: "LINK_NOT_CHECKED", level: "medium", text: "This mail is built in a way that stopped us reading all of it." });
  if (everyLink.length > MAX_LINKS || uniquePairs.length > linkPairs.length) unread.push({ code: "LINK_NOT_CHECKED", level: "medium", text: `This mail has ${everyLink.length} links, too many to check them all.` });
  if (parsed && parsed.text.length > MAX_TEXT) unread.push({ code: "LINK_NOT_CHECKED", level: "medium", text: "This mail is too long to read in full." });

  const deadline = new Promise<null>((resolve) => setTimeout(() => resolve(null), AI_BUDGET_MS));
  const claims = underLimit(`ai:${clientIp(request)}`, AI_PER_MINUTE) ? await Promise.race([extractClaims(text, sender), deadline]) : null;
  const seed = claimedCompany(text);
  const lookup = claims && { ...claims, company: claims.company ?? seed ?? null };
  // Every opened mail reaches here, so the web search runs only for job mail, or newsletters would drain its quota.
  const jobMail = isJobMail(text) || !!claims?.role;
  const [company, linkFlags, intel, campus] = await Promise.all([
    lookup && jobMail ? Promise.race([checkCompany(lookup, sender, seed), deadline]) : null,
    checkLinks(text, allLinks, seed ?? claims?.company ?? undefined),
    threatIntel(sender, allLinks).catch(() => ({ flags: [], checks: [] })),
    campusVerdicts(),
  ]);
  const target = reportTarget(sender);
  if (target?.includes("@") && campus.fake.includes(target)) unread.push({ code: "BLOCKED_SENDER", level: "high", text: "Your placement cell already marked this address as fake." });
  const extra = [
    ...unread,
    ...signalFlags(claims?.signals ?? []),
    ...(company?.flags ?? []),
    ...linkFlags,
    ...(headers?.flags ?? []),
    ...intel.flags,
    ...deepRules({ sender, links: allLinks, linkPairs, attachments: files }),
  ];
  // Only a DMARC-proved From address earns trust; a sender typed into the form proves nothing.
  const proven = !!headers?.authenticated && headers.from === sender.trim().toLowerCase();
  const result = checkRules(text, sender, allLinks, campus.fake.filter((b) => !b.includes("@")), extra, { authenticated: proven, genuine: !!target && campus.genuine.includes(target) });
  await logEvent(result.level, result.attack);

  return Response.json({
    ...result,
    sender,
    evidence: { ...result.evidence, company: company?.summary ?? null },
    sources: company?.sources ?? [],
    checks: securityReport(result.flags, [...(headers?.checks ?? []), ...intel.checks], { sender: !!sender, links: allLinks.length > 0, headers: !!headers, identity: proven ? result.evidence.sender : null }),
    mode: lookup && (company || ((!lookup.company || !jobMail) && !lookup.rejected)) ? "full" : "limited", // nothing to look up isn't a failure
  });
}
