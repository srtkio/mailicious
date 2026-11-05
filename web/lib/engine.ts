// Rules engine: pure, no network, no dependencies, so the extension can reuse it as-is.
// These flags are hard floors: AI/search steps may add risk, never remove it.
import type { CheckResult, Flag, Intent, Level } from "./types";

export const COLLEGE_DOMAIN = "rishihood.edu.in";
export const PLACEMENT_SENDERS = ["placement@rishihood.edu.in"];

// shortcut: hard-coded seed list, move to the Supabase `companies` table once it exists.
export const COMPANIES: Record<string, string[]> = {
  microsoft: ["microsoft.com"],
  google: ["google.com", "careers.google.com"],
  amazon: ["amazon.com", "amazon.jobs", "amazon.in"],
  tcs: ["tcs.com"],
  infosys: ["infosys.com"],
  wipro: ["wipro.com"],
  accenture: ["accenture.com"],
  deloitte: ["deloitte.com"],
  flipkart: ["flipkart.com", "flipkartcareers.com"],
};

const FREE_MAIL = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "rediffmail.com", "proton.me", "protonmail.com", "yahoo.in"];
export const SHORTENERS = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "cutt.ly", "rb.gy", "is.gd", "shorturl.at", "tiny.cc"];
const FORM_HOSTS = ["forms.gle", "docs.google.com", "forms.office.com", "typeform.com", "jotform.com", "form.jotform.com"];

const RANK: Record<Level, number> = { low: 0, medium: 1, high: 2 };
const JOBBY = /\b(offer|internship|intern|placement|hiring|recruit\w*|job|selected|shortlisted|interview|stipend|salary|ctc|hr)\b/i;

const NEXT_STEP: Record<string, string> = {
  ASKS_SECRET: "Do not share the code or password with anyone. Verify with the placement cell before replying.",
  ASKS_FEE: "Do not pay anything. Real companies don't charge to hire you. Check with the placement cell.",
  ASKS_DOCUMENTS: "Don't send ID or bank details over mail. Confirm with the placement cell first.",
  BLOCKED_SENDER: "This sender was already reported as fake on campus. Don't reply or click anything.",
  LOOKALIKE_DOMAIN: "Don't reply or click. Find the company's careers page yourself and apply there.",
  RAW_IP_LINK: "Don't open the link. Verify the offer with the placement cell.",
  FORM_ASKS_DATA: "Don't fill this form. Report it to the placement cell.",
  HACKED_ACCOUNT: "Call or meet the sender in person to confirm they sent this, before you open the link.",
};
const DEFAULT_NEXT = "Don't act on this mail yet. Verify it with the placement cell or the company's official careers page.";
const LOW_NEXT = "No common warning signs, but only apply through the company's official careers site or the placement portal.";

export function hostOf(url: string): string | null {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export const isOn = (host: string, domains: string[]) => domains.some((d) => host === d || host.endsWith(`.${d}`));

// "micr0soft-careers.co" -> "microsoftcareers.co": catches digit swaps and hyphen tricks.
const unswap = (s: string) => s.replace(/0/g, "o").replace(/1/g, "l").replace(/3/g, "e").replace(/5/g, "s").replace(/-/g, "");

export const SECRET = /\b(otp|one[- ]time password|verification code|password|passcode|(upi|atm|card) pin)\b/i;
export const ID_OR_BANK = /\b(aadhaa?r|pan\b|pan card|bank account|account number|ifsc|upi|cvv|card number|debit card)\b/i;

export function findLinks(text: string, links: string[] = []): string[] {
  return [...links, ...(text.match(/\b(?:https?:\/\/|www\.)[^\s<>"')]+|\b(?:bit\.ly|forms\.gle|tinyurl\.com|cutt\.ly|rb\.gy)\/[^\s<>"')]+/gi) ?? [])];
}

export const claimedCompany = (text: string) => Object.keys(COMPANIES).find((c) => new RegExp(`\\b${c}\\b`, "i").test(text));

function sentences(text: string): string[] {
  return text.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
}

// Fail-safe negation: a sentence is cleared only when EVERY verb is directly negated ("never share")
// or EVERY object is directly negated ("no registration fee"). One un-negated pair anywhere = flag.
// So "Don't worry, just share your OTP" and "no fee, but transfer Rs 500" still flag.
const VERB_NEGATED = /\b(never|not|don'?t|do not|won'?t|no need to)\s+$/i;
const OBJECT_NEGATED = /\b(no|zero)\s+(registration\s+|joining\s+|processing\s+|training\s+|application\s+|security\s+|hidden\s+|extra\s+)?$/i;

const all = (s: string, re: RegExp) => [...s.matchAll(new RegExp(re.source, "gi"))];
const negated = (s: string, m: RegExpMatchArray, neg: RegExp) => neg.test(s.slice(0, m.index));

// verb omitted = the object pattern itself is the request (e.g. "pay Rs 500").
function asks(text: string, what: RegExp, verb?: RegExp): boolean {
  return sentences(text).some((s) => {
    const objs = all(s, what);
    if (!objs.length) return false;
    if (!verb) return objs.some((m) => !negated(s, m, VERB_NEGATED) && !negated(s, m, OBJECT_NEGATED));
    const verbs = all(s, verb);
    return verbs.some((m) => !negated(s, m, VERB_NEGATED)) && objs.some((m) => !negated(s, m, OBJECT_NEGATED));
  });
}

export function checkRules(text: string, sender = "", links: string[] = [], blockedDomains: string[] = [], extra: Flag[] = []): CheckResult {
  const flags: Flag[] = [];
  const add = (code: string, level: Level, msg: string) => flags.push({ code, level, text: msg });
  const jobby = JOBBY.test(text);

  // --- what the mail asks you to do ---
  const shareVerb = /\b(shar(e|es|ed|ing)|send(s|ing)?|repl(y|ies|ying)|provid(e|ing)|tell|forward(ing)?|enter(ing)?|submit(ting)?|give|giving|mention|fill(ing)?)\b/i;
  // "pin" alone would hit "PIN code" in addresses, so only UPI/ATM/card PINs count.
  if (asks(text, SECRET, shareVerb))
    add("ASKS_SECRET", "high", "It asks you to share an OTP or password. No real recruiter ever needs this.");
  // Matches money *you* pay (fee/deposit, "pay ₹500"), not salary text like "pay of ₹20,000".
  if (asks(text, /\b(fee|fees|deposit|charges)\b|\b(pay|transfer|deposit)\s+(rs\.?|₹|inr|\d)/i))
    add("ASKS_FEE", "high", "It asks you to pay money. Real companies don't charge you to get hired.");
  if (asks(text, ID_OR_BANK, shareVerb))
    add("ASKS_DOCUMENTS", "high", "It asks for ID or bank details over mail before any formal process.");
  if (asks(text, /\b(whatsapp|telegram)\b/i, /\b(contact|message|join|reply|add|text|ping|dm)\b/i))
    add("MOVE_TO_CHAT", "medium", "It moves the conversation to WhatsApp/Telegram, away from official channels.");
  if (/\bno (interview|test|assessment)\b|\bwithout (any )?(interview|test)\b|\byou (have been|are|were) (directly )?selected\b/i.test(text))
    add("TOO_GOOD", "medium", "It says you're selected without any interview, which real hiring doesn't do.");
  if (/\b(within \d+ ?(hours?|hrs|minutes?)|immediately|urgent(ly)?|last chance|today only|expires? (today|tonight|soon))\b/i.test(text))
    add("URGENCY", "low", "It pushes you to act fast, a common pressure trick.");

  // --- who sent it ---
  const senderAddr = sender.trim().toLowerCase();
  const senderHost = senderAddr.includes("@") ? senderAddr.split("@").pop()! : "";
  const company = claimedCompany(text);
  let senderEvidence: string | null = null;

  if (senderHost && isOn(senderHost, blockedDomains))
    add("BLOCKED_SENDER", "high", `${senderHost} was already reported as fake by your placement cell.`);

  if (senderHost && company) {
    const official = COMPANIES[company];
    const name = company[0].toUpperCase() + company.slice(1);
    if (isOn(senderHost, official)) {
      senderEvidence = `Sent from ${name}'s official domain. This compares the address only; it can't prove who sent it.`;
    } else if (FREE_MAIL.includes(senderHost)) {
      add("FREE_MAIL_CLAIM", "medium", `It claims to be ${name} but was sent from a personal ${senderHost} address.`);
    } else if (unswap(senderHost).includes(company)) {
      add("LOOKALIKE_DOMAIN", "high", `${senderHost} imitates ${name}'s domain but isn't ${official[0]}.`);
    } else if (senderHost !== COLLEGE_DOMAIN) {
      add("WRONG_DOMAIN", "medium", `It claims to be ${name}, but ${senderHost} isn't ${name}'s official domain.`);
    }
  } else if (senderHost && FREE_MAIL.includes(senderHost) && jobby) {
    add("FREE_MAIL_CLAIM", "medium", `A job offer sent from a personal ${senderHost} address, not a company domain.`);
  }

  // --- links: do they go where the mail claims? ---
  const hosts = [...new Set(findLinks(text, links).map(hostOf).filter((h): h is string => !!h))];
  const formHost = hosts.find((h) => isOn(h, FORM_HOSTS));
  for (const h of hosts) {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) add("RAW_IP_LINK", "high", `The link goes to a bare IP address (${h}), not a real website.`);
    else if (isOn(h, SHORTENERS)) add("SHORT_LINK", "medium", `The link is shortened (${h}), so you can't see where it really goes.`);
    else if (company && !isOn(h, COMPANIES[company]) && !isOn(h, FORM_HOSTS) && !isOn(h, [COLLEGE_DOMAIN]))
      add("LINK_MISMATCH", "medium", `The link goes to ${h}, not ${company}'s official site.`);
  }
  if (formHost && jobby)
    add("OUTSIDE_FORM", "medium", `It asks you to fill an outside form (${formHost}) instead of a company careers portal.`);

  // --- own-org sender: real college account, content that doesn't fit (possible hacked account) ---
  if (senderHost === COLLEGE_DOMAIN && !PLACEMENT_SENDERS.includes(senderAddr) && jobby && (company || formHost || hosts.length))
    add("HACKED_ACCOUNT", "medium", "It's from a real college account, but offers like this come only from the placement cell. The account may be hacked.");

  flags.push(...extra);

  // dedupe by code, keep first
  const unique = flags.filter((f, i) => flags.findIndex((g) => g.code === f.code) === i);
  const sorted = [...unique].sort((a, b) => RANK[b.level] - RANK[a.level]);
  const level: Level = sorted.length ? sorted[0].level : "low";
  const top = sorted[0];

  return {
    level,
    reasons: sorted.length ? sorted.slice(0, 2).map((f) => f.text) : ["No common warning signs found in this text. That doesn't prove it's real."],
    nextStep: level === "low" ? LOW_NEXT : NEXT_STEP[top.code] ?? DEFAULT_NEXT,
    intent: intentOf(unique, text, !!formHost, hosts.length > 0),
    flags: sorted,
    evidence: {
      sender: senderEvidence ?? unique.find((f) => ["FREE_MAIL_CLAIM", "LOOKALIKE_DOMAIN", "WRONG_DOMAIN", "BLOCKED_SENDER", "HACKED_ACCOUNT"].includes(f.code))?.text ?? null,
      company: null,
      link: ["FORM_ASKS_DATA", "FORM_MISMATCH", "RAW_IP_LINK", "SHORT_LINK_TARGET", "SHORT_LINK", "LINK_MISMATCH", "OUTSIDE_FORM"].map((c) => unique.find((f) => f.code === c)?.text).find(Boolean) ?? null,
    },
    sources: [],
    mode: "limited",
  };
}

function intentOf(flags: Flag[], text: string, hasForm: boolean, hasLink: boolean): Intent {
  const has = (c: string) => flags.some((f) => f.code === c);
  if (has("ASKS_SECRET")) return "share_otp";
  if (has("ASKS_FEE")) return "pay_fee";
  if (has("ASKS_DOCUMENTS")) return "share_documents";
  if (hasForm) return "fill_form";
  if (has("MOVE_TO_CHAT")) return "move_to_chat";
  if (/\b(apply|register)\b.*\b(portal|careers?)\b/i.test(text)) return "apply_on_portal";
  if (hasLink) return "click_link";
  return "unknown";
}
