// Reads real mail headers and raw messages. This is what a pasted body alone can never show:
// the receiving mail server's own verdict on whether the sender is genuine.
import { simpleParser } from "mailparser";
import { parse } from "parse5";
import { registrable } from "./engine";
import type { Flag, LinkPair, SecurityCheck } from "./types";

const headerValues = (block: string, name: string): string[] =>
  block
    .replace(/\r?\n[ \t]+/g, " ") // long headers wrap across lines
    .split(/\r?\n/)
    .filter((l) => l.toLowerCase().startsWith(`${name}:`))
    .map((l) => l.slice(name.length + 1).trim());

const address = (v = "") => (v.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] ?? v.match(/[^\s<>"',;]+@[^\s<>"',;]+/)?.[0] ?? "").toLowerCase();
const domainOf = (a: string) => a.split("@").pop() ?? "";

// Reads methods from the start of each ";" segment after removing comments and quoted strings, so an
// address containing "dmarc=pass" can't pose as a result. One failure of a method counts as failed.
function authResults(value: string): Record<string, string> {
  const clean = value.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/\([^()]*\)/g, " ");
  const found: Record<string, string> = {};
  for (const segment of clean.split(";").slice(1)) {
    const m = segment.match(/^\s*(spf|dkim|dmarc)\s*=\s*(\w+)/i);
    if (!m) continue;
    const [method, verdict] = [m[1].toLowerCase(), m[2].toLowerCase()];
    if (!found[method] || found[method] === "pass") found[method] = verdict;
  }
  return found;
}

export type HeaderReport = { from: string; flags: Flag[]; checks: SecurityCheck[] };

export function analyzeHeaders(block: string): HeaderReport {
  const from = address(headerValues(block, "from")[0]);
  const replyTo = (headerValues(block, "reply-to")[0] ?? "").split(",").map(address).filter(Boolean);
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

  const elsewhere = from ? replyTo.find((a) => registrable(domainOf(a)) !== registrable(domainOf(from))) : undefined;
  if (elsewhere) {
    flags.push({ code: "REPLY_TO_MISMATCH", level: "medium", text: `It's from ${domainOf(from)}, but replies would go to ${domainOf(elsewhere)}.` });
    checks.push({ label: "Reply address", status: "fail", detail: `Replies go to ${elsewhere}, not the sender.` });
  } else if (from) {
    checks.push({ label: "Reply address", status: "pass", detail: "Replies go back to the sender's own domain." });
  }
  return { from, flags, checks };
}

type Node = { nodeName: string; value?: string; attrs?: { name: string; value: string }[]; childNodes?: Node[] };

// Iterative, because a mail can nest elements deeply enough to overflow a recursive walk.
function textOf(root: Node): string {
  const parts: string[] = [];
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.nodeName === "#text") parts.push(node.value ?? "");
    if (node.nodeName === "style" || node.nodeName === "script") continue;
    if (/^(p|div|br|tr|li)$/.test(node.nodeName)) parts.push(" ");
    stack.push(...[...(node.childNodes ?? [])].reverse());
  }
  return parts.join("").replace(/\s+/g, " ").trim();
}

function readHtml(html: string): { text: string; linkPairs: LinkPair[] } {
  const root = parse(html) as unknown as Node;
  const linkPairs: LinkPair[] = [];
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    const href = node.nodeName === "a" ? node.attrs?.find((a) => a.name === "href")?.value.trim() : undefined;
    if (href && /^https?:/i.test(href)) linkPairs.push({ href: href.slice(0, 2000), text: textOf(node).slice(0, 500) });
    stack.push(...[...(node.childNodes ?? [])].reverse());
  }
  return { text: textOf(root), linkPairs };
}

export type ParsedMail = { headers: string; text: string; linkPairs: LinkPair[]; attachments: string[] };

export async function parseRawMail(raw: string): Promise<ParsedMail> {
  const split = raw.search(/\r?\n\r?\n/);
  const mail = await simpleParser(raw, { skipImageLinks: true, skipTextLinks: true });
  const html = mail.html ? readHtml(mail.html) : { text: "", linkPairs: [] };
  const plain = mail.text?.trim() ?? "";
  return {
    headers: split < 0 ? raw : raw.slice(0, split),
    // Both are scanned: a scam can show one thing in HTML and another in the plain part.
    text: [html.text, plain.replace(/\s+/g, " ") === html.text ? "" : plain].filter(Boolean).join("\n"),
    linkPairs: html.linkPairs,
    attachments: mail.attachments.flatMap((a) => a.filename ?? []),
  };
}
