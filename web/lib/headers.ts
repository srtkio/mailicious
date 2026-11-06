// Reads real mail headers and raw messages. This is what a pasted body alone can never show:
// the receiving mail server's own verdict on whether the sender is genuine.
import { simpleParser } from "mailparser";
import { parse } from "parse5";
import { addressOf, looseAddress, registrable, stripComments } from "./engine";
import type { Flag, LinkPair, SecurityCheck } from "./types";

const headerValues = (block: string, name: string): string[] =>
  block
    .replace(/\r?\n[ \t]+/g, " ") // long headers wrap across lines
    .split(/\r?\n/)
    .filter((l) => l.toLowerCase().startsWith(`${name}:`))
    .map((l) => l.slice(name.length + 1).trim());

const address = addressOf;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const domainOf = (a: string) => a.split("@").pop() ?? "";

const VERDICT_RANK = ["pass", "none", "neutral", "policy", "temperror", "softfail", "fail", "permerror"];
const rank = (verdict: string) => VERDICT_RANK.indexOf(verdict);


// Reads methods from the start of each ";" segment, so an address containing "dmarc=pass" can't pose as a
// result. Every segment counts, because Outlook has no server name first. The worst verdict for a method wins,
// and a word we don't know counts as a failure.
function authResults(value: string): Record<string, string> {
  const found: Record<string, string> = {};
  const record = (method: string, word: string) => {
    const verdict = VERDICT_RANK.includes(word) ? word : "permerror";
    if (!found[method] || rank(verdict) > rank(found[method])) found[method] = verdict;
  };
  const { clean, malformed } = stripComments(value);
  for (const segment of clean.split(";")) {
    const m = segment.match(/^\s*(spf|dkim|dmarc)\s*=\s*(\w+)/i);
    if (m) record(m[1].toLowerCase(), m[2].toLowerCase());
  }
  // A broken comment can swallow the rest of the header, so scan it all, but this scan can only make a result
  // worse: text in a broken header can be planted, so a "pass" found here proves nothing.
  if (malformed)
    for (const m of value.matchAll(/\b(spf|dkim|dmarc)\s*=\s*(\w+)/gi))
      if (m[2].toLowerCase() !== "pass") record(m[1].toLowerCase(), m[2].toLowerCase());
  return found;
}

export type HeaderReport = { from: string; looseFrom: string; authenticated: boolean; flags: Flag[]; checks: SecurityCheck[] }; // authenticated: DMARC proved the From domain

export function analyzeHeaders(block: string): HeaderReport {
  const from = address(headerValues(block, "from")[0]);
  const replyRaw = headerValues(block, "reply-to").join(",");
  const replyParsed = stripComments(replyRaw);
  const replyParts = replyParsed.clean.split(",").map((p) => p.trim()).filter(Boolean).map(address);
  const replyTo = replyParsed.malformed ? [] : replyParts.filter(Boolean);
  // One unreadable address is enough: a quiet pass would hide where the reply might go.
  const replyUnreadable = replyRaw.trim() !== "" && (replyParsed.malformed || replyParts.length === 0 || replyParts.some((a) => !a));
  // Only the top one counts: it's the receiver's. Anything below can be forged by the sender.
  const auth = headerValues(block, "authentication-results")[0] ?? "";
  const results = authResults(auth);
  const [spf, dkim, dmarc] = [results.spf ?? null, results.dkim ?? null, results.dmarc ?? null];
  const domain = domainOf(from) || "the sender's domain";

  const flags: Flag[] = [];
  const checks: SecurityCheck[] = [];
  const summary = `SPF ${spf ?? "not found"}, DKIM ${dkim ?? "not found"}, DMARC ${dmarc ?? "not found"}.`;
  const bad = (r: string | null) => r === "fail" || r === "permerror";
  if (!auth) {
    checks.push({ label: "Sender authentication", status: "skip", detail: "These headers have no authentication results." });
  } else if (bad(dmarc) || (bad(spf) && bad(dkim))) {
    flags.push({ code: "AUTH_FAIL", level: "high", text: `This mail failed sender checks, so it isn't really from ${domain}.` });
    checks.push({ label: "Sender authentication", status: "fail", detail: summary });
  } else if (bad(spf) || bad(dkim) || spf === "softfail" || !dmarc || dmarc === "none") {
    if (bad(spf) || bad(dkim) || spf === "softfail") flags.push({ code: "AUTH_WEAK", level: "medium", text: `One of the checks proving this came from ${domain} failed.` });
    checks.push({ label: "Sender authentication", status: "warn", detail: summary });
  } else {
    checks.push({ label: "Sender authentication", status: "pass", detail: summary });
  }

  // Proven only with one clear From address, on the domain every DMARC pass actually checked.
  const fromHeaders = headerValues(block, "from");
  const addresses = stripComments(fromHeaders.join(",")).clean.match(/@/g)?.length ?? 0;
  const passes = stripComments(auth).clean.split(";").map((s) => s.match(/^\s*dmarc\s*=\s*pass\b[^]*?\bheader\.from=([^\s;]+)/i)).filter((m) => m !== null);
  if (!from && fromHeaders.some((v) => v.includes("@")))
    flags.push({ code: "MALFORMED_SENDER", level: "medium", text: "The sender's address is written in an unusual way, so we can't verify who sent this." });
  const aligned = passes.length > 0 && passes.every((m) => registrable(m[1].toLowerCase()) === registrable(domainOf(from)));
  const authenticated = dmarc === "pass" && EMAIL.test(from) && fromHeaders.length === 1 && addresses === 1 && aligned;

  const elsewhere = from ? replyTo.find((a) => registrable(domainOf(a)) !== registrable(domainOf(from))) : undefined;
  // Nobody replies to a no-reply address, so a different reply domain there is a note, not an alarm. DMARC must pass.
  const noReply = /^(no-?reply|do-?not-?reply|donotreply|notifications?|alerts?|mailer-daemon|bounces?)([._+-]|$)/.test(from.split("@")[0]);
  const quiet = noReply && authenticated; // DMARC alone only proves who owns the domain, so the full sender proof is needed
  if (replyUnreadable) {
    flags.push({ code: "REPLY_TO_MISMATCH", level: "medium", text: "The reply address couldn't be read, so replies might go somewhere else." });
    checks.push({ label: "Reply address", status: "fail", detail: "The reply address couldn't be read." });
  } else if (elsewhere) {
    flags.push({
      code: "REPLY_TO_MISMATCH",
      level: quiet ? "low" : "medium",
      text: quiet ? `Replies go to ${domainOf(elsewhere)}, but this is a no-reply address, so it matters little.` : `It's from ${domainOf(from)}, but replies would go to ${domainOf(elsewhere)}.`,
    });
    checks.push({ label: "Reply address", status: quiet ? "warn" : "fail", detail: `Replies go to ${elsewhere}, not the sender.` });
  } else if (from) {
    checks.push({ label: "Reply address", status: "pass", detail: "Replies go back to the sender's own domain." });
  }
  return { from, looseFrom: looseAddress(headerValues(block, "from").join(",")), authenticated, flags, checks };
}

type Node = { nodeName: string; namespaceURI?: string; value?: string; attrs?: { name: string; value: string }[]; childNodes?: Node[] };

const MAX_NODES = 200_000;
const MAX_ANCHORS = 200;
const ANCHOR_NODES = 2000; // per link, so links nested in links can't make the walk quadratic
const NO_BASE = "https://no-base.invalid/";

// Iterative, because a mail can nest elements deeply enough to overflow a recursive walk.
function pushChildren(stack: Node[], node: Node) {
  const kids = node.childNodes ?? [];
  for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
}

function textOf(root: Node, maxChars: number, maxNodes: number): { text: string; cut: boolean } {
  const parts: string[] = [];
  const stack = [root];
  let length = 0; // visible characters only, so whitespace padding can't use up the limit
  for (let seen = 0; stack.length && seen < maxNodes && length < maxChars; seen++) {
    const node = stack.pop()!;
    if (node.nodeName === "style" || node.nodeName === "script") continue;
    const piece = node.nodeName === "#text" ? (node.value ?? "") : /^(p|div|br|tr|li)$/.test(node.nodeName) ? " " : "";
    parts.push(piece);
    length += piece.trim().length;
    pushChildren(stack, node);
  }
  return { text: parts.join("").replace(/\s+/g, " ").trim(), cut: stack.length > 0 && length < maxChars };
}

// Cleans a link the way a browser does, so "ht\ntps://x", " //x" and <base> tricks can't hide it.
function resolveLink(href: string, base: string): string | null {
  try {
    // eslint-disable-next-line no-control-regex
    const url = new URL(href.replace(/[\t\r\n]/g, "").replace(/^[\u0000-\u0020]+/, ""), base);
    return /^https?:$/.test(url.protocol) && url.origin + "/" !== NO_BASE ? url.href : null;
  } catch {
    return null;
  }
}

function readHtml(html: string): { text: string; linkPairs: LinkPair[]; partial: boolean } {
  const root = parse(html, { scriptingEnabled: false }) as unknown as Node;
  const anchors: Node[] = [];
  const stack = [root];
  const attr = (node: Node, name: string) => node.attrs?.find((a) => a.name === name)?.value.trim();
  let base = "";
  let baseFound = false;
  let seen = 0;
  let partial = false;
  while (stack.length) {
    if (++seen > MAX_NODES) {
      partial = true;
      break;
    }
    const node = stack.pop()!;
    if (!baseFound && node.nodeName === "base" && node.namespaceURI?.endsWith("/xhtml") && attr(node, "href") !== undefined) {
      baseFound = true; // like browsers: the first real one wins, wherever it sits, even if it's invalid
      base = resolveLink(attr(node, "href")!, NO_BASE) ?? "";
      partial ||= !base;
    }
    if ((node.nodeName === "a" || node.nodeName === "area") && attr(node, "href")) anchors.push(node);
    pushChildren(stack, node);
  }

  const linkPairs: LinkPair[] = [];
  for (const node of anchors) {
    const link = resolveLink(attr(node, "href")!, base || NO_BASE);
    if (!link) continue;
    if (linkPairs.length >= MAX_ANCHORS) {
      partial = true;
      break;
    }
    const shown = node.nodeName === "area" ? { text: attr(node, "alt") ?? "", cut: false } : textOf(node, 500, ANCHOR_NODES);
    partial ||= shown.cut;
    linkPairs.push({ href: link.slice(0, 2000), text: shown.text.slice(0, 500) });
  }
  return { text: textOf(root, Infinity, MAX_NODES).text, linkPairs, partial };
}

export type ParsedMail = { headers: string; text: string; linkPairs: LinkPair[]; attachments: string[]; partial: boolean }; // partial: part of it couldn't be read

export async function parseRawMail(raw: string): Promise<ParsedMail> {
  const split = raw.search(/\r?\n\r?\n/);
  const mail = await simpleParser(raw, { skipImageLinks: true, skipTextLinks: true });
  let html: ReturnType<typeof readHtml> = { text: "", linkPairs: [], partial: false };
  try {
    if (mail.html) html = readHtml(mail.html);
  } catch {
    html.partial = true; // fall back to the plain part and say so
  }
  const plain = mail.text?.trim() ?? "";
  return {
    headers: split < 0 ? raw : raw.slice(0, split),
    // Both are scanned: a scam can show one thing in HTML and another in the plain part.
    text: [html.text, plain.replace(/\s+/g, " ") === html.text ? "" : plain].filter(Boolean).join("\n"),
    linkPairs: html.linkPairs,
    attachments: mail.attachments.flatMap((a) => a.filename ?? []),
    partial: html.partial,
  };
}
