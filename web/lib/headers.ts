// Reads real mail headers and raw messages. Pure. This is what a pasted body alone can never show:
// the receiving mail server's own verdict on whether the sender is genuine.
import type { Flag, LinkPair, SecurityCheck } from "./types";

const headerValues = (block: string, name: string): string[] =>
  block
    .replace(/\r?\n[ \t]+/g, " ") // long headers wrap across lines
    .split(/\r?\n/)
    .filter((l) => l.toLowerCase().startsWith(`${name}:`))
    .map((l) => l.slice(name.length + 1).trim());

const address = (v = "") => (v.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] ?? v.match(/[^\s<>"',;]+@[^\s<>"',;]+/)?.[0] ?? "").toLowerCase();
const domainOf = (a: string) => a.split("@").pop() ?? "";
const baseDomain = (d: string) => d.split(".").slice(-2).join(".");

export type HeaderReport = { from: string; flags: Flag[]; checks: SecurityCheck[] };

export function analyzeHeaders(block: string): HeaderReport {
  const from = address(headerValues(block, "from")[0]);
  const replyTo = address(headerValues(block, "reply-to")[0]);
  // Only the top one counts: it's the receiver's. Anything below can be forged by the sender.
  const auth = headerValues(block, "authentication-results")[0] ?? headerValues(block, "arc-authentication-results")[0] ?? "";
  const result = (kind: string) => auth.match(new RegExp(`\\b${kind}=(\\w+)`, "i"))?.[1].toLowerCase() ?? null;
  const [spf, dkim, dmarc] = [result("spf"), result("dkim"), result("dmarc")];
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

  if (replyTo && from && baseDomain(domainOf(replyTo)) !== baseDomain(domainOf(from))) {
    flags.push({ code: "REPLY_TO_MISMATCH", level: "medium", text: `It's from ${domainOf(from)}, but replies would go to ${domainOf(replyTo)}.` });
    checks.push({ label: "Reply address", status: "fail", detail: `Replies go to ${replyTo}, not the sender.` });
  } else if (from) {
    checks.push({ label: "Reply address", status: "pass", detail: "Replies go back to the sender's own domain." });
  }
  return { from, flags, checks };
}

function decodeBody(body: string, encoding: string): string {
  if (/base64/i.test(encoding)) return Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf8");
  if (/quoted-printable/i.test(encoding))
    return Buffer.from(
      body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))),
      "latin1",
    ).toString("utf8");
  return body;
}

const stripTags = (html: string) =>
  html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

type Parts = { plain: string; html: string; attachments: string[] };

function walk(part: string, out: Parts, depth = 0): void {
  const split = part.search(/\r?\n\r?\n/);
  const head = split < 0 ? part : part.slice(0, split);
  const body = split < 0 ? "" : part.slice(split).trimStart();
  const type = headerValues(head, "content-type")[0] ?? "text/plain";
  const boundary = type.match(/boundary="?([^";]+)"?/i)?.[1];
  if (boundary && depth < 5) {
    for (const sub of body.split(`--${boundary}`).slice(1)) if (!sub.startsWith("--")) walk(sub.replace(/^\r?\n/, ""), out, depth + 1);
    return;
  }
  const disposition = headerValues(head, "content-disposition")[0] ?? "";
  const filename = `${disposition} ${type}`.match(/(?:file)?name="?([^";]+)"?/i)?.[1];
  if (filename) out.attachments.push(filename.trim());
  else if (/text\/html/i.test(type)) out.html += decodeBody(body, headerValues(head, "content-transfer-encoding")[0] ?? "");
  else if (/text\/plain/i.test(type)) out.plain += decodeBody(body, headerValues(head, "content-transfer-encoding")[0] ?? "");
}

export type ParsedMail = { headers: string; text: string; linkPairs: LinkPair[]; attachments: string[] };

export function parseRawMail(raw: string): ParsedMail {
  const split = raw.search(/\r?\n\r?\n/);
  const headers = split < 0 ? raw : raw.slice(0, split);
  const out: Parts = { plain: "", html: "", attachments: [] };
  if (split >= 0) walk(raw, out);
  const linkPairs = [...out.html.matchAll(/<a\b[^>]*href=["']?([^"'\s>]+)[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({ href: m[1], text: stripTags(m[2]).trim() }));
  return { headers, text: (out.plain || stripTags(out.html)).trim(), linkPairs: linkPairs.filter((l) => /^https?:/i.test(l.href)), attachments: out.attachments };
}
