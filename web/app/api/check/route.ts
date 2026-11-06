import { checkCompany, extractClaims, MAX_MAIL, signalFlags } from "@/lib/ai";
import { dnaMatch, scamDna } from "@/lib/dna";
import { dnaToken } from "@/lib/dna-token";
import { addressOf, checkRules, claimedCompany, deepRules, findLinks, isCollegeOffice, isJobMail, looseAddress } from "@/lib/engine";
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
  // Trust needs the strict address; warnings use the loose one, so a broken From can't dodge the look-alike and blocklist checks.
  const sender = addressOf(input.sender) || headers?.from || looseAddress(input.sender) || headers?.looseFrom || "";
  // Duplicates count once, so one link repeated can't use up the limit.
  const uniquePairs = [...new Map([...(input.linkPairs ?? []), ...(parsed?.linkPairs ?? [])].map((l) => [`${l.href}\n${l.text}`, l])).values()];
  const linkPairs = uniquePairs.slice(0, MAX_LINKS * 3);
  const files = [...attachments, ...(parsed?.attachments ?? [])];
  // Real link targets come first, so text can't pad them out of the limit.
  const everyLink = [...new Set([...uniquePairs.map((l) => l.href), ...findLinks(parsed?.text ?? text, links)])];
  const allLinks = everyLink.slice(0, MAX_LINKS);
  const unread: Flag[] = [];
  if (typeof input.sender === "string" && input.sender.includes("@") && !addressOf(input.sender))
    unread.push({ code: "MALFORMED_SENDER", level: "medium", text: "The sender's address is written in an unusual way, so we can't verify who sent this." });
  if (input.unreadBody === true) unread.push({ code: "BODY_NOT_READ", level: "medium", text: "This mail is mostly images, which we can't read, so we only checked the sender, subject and links." });
  if (parsed?.partial) unread.push({ code: "LINK_NOT_CHECKED", level: "medium", text: "This mail is built in a way that stopped us reading all of it." });
  if (everyLink.length > MAX_LINKS || uniquePairs.length > linkPairs.length) unread.push({ code: "LINK_NOT_CHECKED", level: "medium", text: `This mail has ${everyLink.length} links, too many to check them all.` });
  if (parsed && parsed.text.length > MAX_TEXT) unread.push({ code: "LINK_NOT_CHECKED", level: "medium", text: "This mail is too long to read in full." });

  const deadline = new Promise<null>((resolve) => setTimeout(() => resolve(null), AI_BUDGET_MS));
  // Only a DMARC-proved From address earns trust; a sender typed into the form proves nothing.
  const proven = !!headers?.authenticated && headers.from === sender.trim().toLowerCase();
  const collegeSender = proven && isCollegeOffice(sender); // an office needs no lookup; a personal account pushing an offer still does
  const claims = underLimit(`ai:${clientIp(request)}`, AI_PER_MINUTE) ? await Promise.race([extractClaims(text, sender), deadline]) : null;
  const seed = claimedCompany(text);
  const lookup = claims && { ...claims, company: claims.company ?? seed ?? null };
  // Every opened mail reaches here, so the web search runs only for job mail, or newsletters would drain its quota.
  const jobMail = isJobMail(text) || !!claims?.role;
  const [company, linkFlags, intel, campus] = await Promise.all([
    lookup && jobMail && !collegeSender ? Promise.race([checkCompany(lookup, sender, seed), deadline]) : null,
    checkLinks(text, allLinks, seed ?? claims?.company ?? undefined),
    threatIntel(sender, allLinks).catch(() => ({ flags: [], checks: [] })),
    campusVerdicts(),
  ]);
  const target = reportTarget(sender);
  if (target?.includes("@") && campus.fake.includes(target)) unread.push({ code: "BLOCKED_SENDER", level: "high", text: "Your placement cell already marked this address as fake." });
  // The script itself, so a scammer who changes address is still caught. The college's own warnings about a scam can quote it, so offices are exempt.
  const dna = scamDna(text);
  const scriptMatch = collegeSender || (proven && !!target && campus.genuine.includes(target)) ? null : dnaMatch(dna, campus.scripts);
  if (scriptMatch) unread.push({ code: "SCAM_DNA", level: "high", text: `This mail's script is a ${scriptMatch}% match for a scam your placement cell already marked fake, sent from a different address.` });
  // A different reply domain only stays a quiet note when the mail doesn't ask you to reply.
  const replyAsk = /\b(reply|respond|write back|get back to|send (us|me)|e-?mail us|mail us|contact us at)\b/i.test(text);
  const headerFlags = (headers?.flags ?? []).map((f) =>
    f.code === "REPLY_TO_MISMATCH" && f.level === "low" && replyAsk ? { ...f, level: "medium" as const, text: f.text.replace(/, but this is a no-reply address, so it matters little\./, ", and this mail asks you to reply.") } : f,
  );
  const extra = [
    ...unread,
    ...signalFlags(claims?.signals ?? []),
    ...(company?.flags ?? []),
    ...linkFlags,
    ...headerFlags,
    ...intel.flags,
    ...deepRules({ sender, links: allLinks, linkPairs, attachments: files }),
  ];
  const result = checkRules(text, sender, allLinks, campus.fake.filter((b) => !b.includes("@")), extra, { authenticated: proven, genuine: !!target && campus.genuine.includes(target), aiChecked: !!claims && text.length <= MAX_MAIL });
  await logEvent(result.level, result.attack);

  return Response.json({
    ...result,
    sender,
    dna,
    dnaMatch: scriptMatch,
    dnaToken: dna && target && result.level !== "low" ? dnaToken(dna, target) : null, // only a mail we flagged can add to the scam list
    evidence: { ...result.evidence, company: company?.summary ?? null },
    sources: company?.sources ?? [],
    checks: securityReport(result.flags, [...(headers?.checks ?? []), ...intel.checks], { sender: !!sender, links: allLinks.length > 0, headers: !!headers, identity: proven ? result.evidence.sender : null }),
    mode: lookup && (company || ((!lookup.company || !jobMail || collegeSender) && !lookup.rejected)) ? "full" : "limited", // nothing to look up isn't a failure
  });
}
