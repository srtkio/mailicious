// Rules engine: pure, no network, no dependencies, so the extension can reuse it as-is.
// These flags are hard floors: AI/search steps may add risk, never remove it.
import type { CheckResult, Flag, Intent, Level, LinkPair } from "./types";

export const COLLEGE_DOMAIN = "rishihood.edu.in";
export const PLACEMENT_SENDERS = ["placement@rishihood.edu.in"];
// Office accounts vs personal ones like manjistha.b@. Names come from real college mail; the dashboard's "Mark genuine" covers the rest.
const OFFICE_ACCOUNT = /learner|council|office|manager|academic|director|registrar|admission|placement|career|library|hostel|finance|committee|society|alumni|helpdesk|support|examination|(^|[._-])(club|cell|dean|admin|exam|dept|hod|info|contact|noreply|no-reply|accounts?)([._-]|$)/;

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

export const FREE_MAIL = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "rediffmail.com", "proton.me", "protonmail.com", "yahoo.in"];
export const SHORTENERS = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "cutt.ly", "rb.gy", "is.gd", "shorturl.at", "tiny.cc"];
const FORM_HOSTS = ["forms.gle", "docs.google.com", "forms.office.com", "typeform.com", "jotform.com", "form.jotform.com"];

const RANK: Record<Level, number> = { low: 0, medium: 1, high: 2 };
const JOBBY = /\b(offers?|internships?|interns?|placements?|hiring|recruit\w*|jobs?|selected|shortlisted|interviews?|stipend|salary|ctc|hr|career\w*|vacanc\w*|openings?|opportunit\w*|fresher\w*)\b/i;

const NEXT_STEP: Record<string, string> = {
  ASKS_SECRET: "Do not share the code or password with anyone. Verify with the placement cell before replying.",
  ASKS_FEE: "Do not pay anything. Real companies don't charge to hire you. Check with the placement cell.",
  ASKS_DOCUMENTS: "Don't send ID or bank details over mail. Confirm with the placement cell first.",
  BLOCKED_SENDER: "This sender was already reported as fake on campus. Don't reply or click anything.",
  LOOKALIKE_DOMAIN: "Don't reply or click. Find the company's careers page yourself and apply there.",
  RAW_IP_LINK: "Don't open the link. Verify the offer with the placement cell.",
  FORM_ASKS_DATA: "Don't fill this form. Report it to the placement cell.",
  AUTH_FAIL: "This mail failed the checks that prove who sent it. Don't reply or click anything.",
  HIDDEN_LINK: "Don't click it. The link is disguised as a different website.",
  HOMOGRAPH_LINK: "Don't open it. The address uses look-alike characters to imitate a real site.",
  LOOKALIKE_LINK: "Don't open it. Find the company's careers page yourself and apply there.",
  DANGEROUS_ATTACHMENT: "Don't open the attachment. It can install malware on your device.",
  KNOWN_MALICIOUS: "Don't open the link. Security services already list it as dangerous.",
  NEW_DOMAIN: "Be careful: real recruiters don't use websites this new. Verify with the placement cell.",
  REMOTE_ACCESS: "Don't install it. Nobody hiring you needs control of your device.",
  MONEY_MULE: "Don't do this. Moving money for strangers is illegal even if you keep nothing. Tell the placement cell.",
  OUTSIDE_FORM: "Check who sent this before filling the form, and never enter passwords, ID or bank details in it.",
  PAYMENT_NOTICE: "Pay only through the official college portal, never by UPI or a link in a mail.",
  REPLY_TO_MISMATCH: "Don't reply to this mail. Contact them through their official website instead.",
  MALFORMED_SENDER: "Don't trust this sender. Check the address by hand before replying.",
  HACKED_ACCOUNT: "Call or meet the sender in person to confirm they sent this, before you open the link.",
};
const DEFAULT_NEXT = "Don't act on this mail yet. Verify it with the placement cell or the company's official careers page.";
const TRUSTED_NEXT = "This looks genuine, so you can go ahead with what the mail asks.";
const COLLEGE_NEXT = "This is a real college account. If it asks for anything unusual, confirm with the person directly.";
const LOW_NEXT = "No common warning signs, but only apply through the company's official careers site or the placement portal.";

const SECOND_LEVEL = /^(co|org|net|ac|edu|gov|gen|firm|res)$/;
// shortcut: handles Indian-style second-level domains, not the full public suffix list.
export function registrable(host: string): string {
  const parts = host.split(".");
  return parts.slice(parts.length > 2 && parts.at(-1)!.length === 2 && SECOND_LEVEL.test(parts.at(-2)!) ? -3 : -2).join(".");
}

// Pasted senders often look like "Library <library@college.edu>".
// Removes quoted strings and comments, which can nest, in one left-to-right pass.
export function stripComments(value: string): { clean: string; malformed: boolean } {
  let out = "";
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "\\" && (quoted || depth)) i++;
    else if (quoted) quoted = c !== '"';
    else if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (!depth && c === '"') quoted = true;
    else if (!depth) out += c;
  }
  return { clean: out, malformed: depth > 0 || quoted };
}

// For checks that only ever add warnings (look-alikes, blocklist): the last address-looking text, however broken the header.
export const looseAddress = (value = "") => ([...value.matchAll(/[^\s<>"',;()]+@[^\s<>"',;()]+/g)].at(-1)?.[0] ?? "").toLowerCase();

// The real address is the last <...> outside quotes and comments: a display name can hold a fake one.
// Fails closed: an unclosed quote or comment, or a quoted local part, gives no address, so nothing is trusted.
export const addressOf = (value = "") => {
  const { clean, malformed } = stripComments(value);
  if (malformed) return "";
  const angled = [...clean.matchAll(/<([^<>\s]+@[^<>\s]+)>/g)].at(-1)?.[1];
  return (angled ?? clean.match(/[^\s<>"',;]+@[^\s<>"',;]+/)?.[0] ?? "").toLowerCase();
};

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
export const ID_OR_BANK = /\b(aadhaa?r|pan\b|pan card|bank account|account number|ifsc|upi\s*(id|number|handle|details|address)|cvv|card number|debit card)\b/i;

// A code sent to you that you're asked to pass on, whatever it's called. Requires both halves, and no word near
// "code" can clear it. Entering a code on a site is normal, so only handing it to a person counts.
const CODE_SENT = /\b\d[- ]digit\s+(number|code|pin)\b|\b(activation|security|login|confirmation|access|sms|secret|unique)\s+code\b|\bcode\b[^.!?\n]{0,60}\b(sms|text message|mobile|phone)\b|\b(sms|text message|mobile|phone)\b[^.!?\n]{0,60}\bcode\b/i;
const PASS_BACK = /\b(shar(e|ing)|send|forward(ing)?|tell|reply|give|mention|provide|submit)\b/i;
const THE_CODE = /\b(that|this|the|same)\s+(code|number|pin)\b|\bcode\b|\bit\b/i;

const AMOUNT = /(?:\brs(?![a-z])\.?|\binr(?![a-z])|₹)\s*\d[\d,]*|\b\d[\d,]*\s*(?:rupees|inr|\/-)/gi;
// Money you'd receive only counts when the wording binds it to this amount, so a salary nearby can't clear a fee.
const INCOME_BEFORE = /\b(stipend|salary|ctc|package|allowance|bonus|scholarship|prize|pay of|pay you)\b\s*(of|is|are|:|will be|=|up to)?\s*$/i;
const INCOME_AFTER = /^\s*(\/-)?\s*(per month|\/\s*month|monthly|a month|lpa|stipend|salary|ctc|allowance|bonus|scholarship)\b/i;
// Clears a fee only when these words are tied to it, or when warning about someone else asking. The rest of the sentence is still read.
const SETTLED_FEE = /\b(fees?|charges)\b(?:(?!\b(?:pay|transfer|deposit)\b|₹|\brs\b|\binr\b)[^.!?\n]){0,40}?\b(is|are|has been|have been|will be)\s+(waived|included in (your|the) (semester|tuition|college) fees?)/gi;
// Only with an instruction to report it, so "if anyone asks for a fee, pay the deposit" stays a demand.
const FEE_WARNING = /\bif\s+(any\s+\w+|anyone|someone|a\s+\w+)\s+(asks?|demands?|requests?)\s+(you\s+)?(for\s+)?(a\s+|any\s+)?(fees?|money|payment|deposit)\b[^.!?\n]{0,50}?\b(report|tell|inform|ignore|contact)\b/gi;
// Only filler words may sit between the promise and the fee, so nothing else in the sentence can be cleared.
const NO_FEE_PROMISE = /\b(?:(?:does not|do not|doesn'?t|don'?t|will not|won'?t|never)\s+(?:charge|ask for|collect|require|demand)|no\s+(?:genuine|real|legitimate)\s+(?:(?:company|recruiter|employer|firm|organi[sz]ation|or|the|placement|cell)\s+){1,6}charges?)\s+(?:(?:any|a|an|the|candidates?|students?|applicants?|you|for|registration|joining|processing|recruitment|placement|application|training)\s+){0,5}(?:fees?|money|payments?|charges?)\b/gi;
// Bills, refunds and tickets all mention money, so once the AI has judged a non-job mail, the word-matching fee rule stays out.
const JOB_CONTEXT = /\b(internships?|interns?|placements?|hiring|recruit\w*|jobs?|shortlisted|interviews?|stipend|salary|ctc|joining|join|offer letter|selected for|slot|candidates?|onboarding|programs?|training)\b/i;
const CREDENTIALS = /\b(verify|confirm|validate|update)\s+(your\s+)?(account|mailbox|email|login|credentials)\b|\bmailbox\b[^.!?\n]{0,30}\bfull\b/i;
// Naming a tool isn't claiming to be the company that makes it.
const TOOL_NAMES = /\b(on|via|using|through|over|join|in|fill|this|the|a)\s+(google\s+(meet|forms?|drive|docs?|sheets?|classroom|calendar)|microsoft\s+(teams|office|word|excel|forms?|outlook))\b(?!\s+(intern\w*|team|hiring|offer|job|role|program\w*|recruit\w*))/gi;

// An amount to pay that isn't called a fee, like "laptop shipping amount of ₹899 must be cleared".
function asksForMoney(text: string): boolean {
  const owed = sentences(text.replace(/\brs\.\s*/gi, "Rs ")).some((s) =>
    [...s.matchAll(AMOUNT)].some((m) => !INCOME_BEFORE.test(s.slice(0, m.index)) && !INCOME_AFTER.test(s.slice(m.index + m[0].length))),
  );
  return owed && asks(text, /\b(transfer|remit|cleared?|pay|payment|(to|must|should) be paid)\b/i); // "paid" alone is a receipt
}

export function findLinks(text: string, links: string[] = []): string[] {
  return [...links, ...(text.match(/\b(?:https?:\/\/|www\.)[^\s<>"')]+|\b(?:bit\.ly|forms\.gle|tinyurl\.com|cutt\.ly|rb\.gy)\/[^\s<>"')]+/gi) ?? [])];
}

export const isJobMail = (text: string) => JOBBY.test(text);

export const claimedCompany = (text: string) => {
  const named = text.replace(TOOL_NAMES, " ");
  return Object.keys(COMPANIES).find((c) => new RegExp(`\\b${c}\\b`, "i").test(named));
};

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

function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

const IMITATED: Record<string, string[]> = { ...COMPANIES, rishihood: [COLLEGE_DOMAIN] };

// "microsft.com" or "rnicrosoft.com" imitating a seed company, whether or not the mail names it.
function imitatedCompany(host: string): string | undefined {
  const label = host.split(".").slice(-2)[0].replace(/rn/g, "m");
  const name = host.split(".").slice(0, -1).join("");
  return Object.keys(IMITATED).find((c) => {
    if (c.length < 5 || isOn(host, IMITATED[c])) return false;
    return editDistance(unswap(label), c) <= 2 || unswap(name).includes(c) || unswap(name.replace(/rn/g, "m")).includes(c);
  });
}

const looksLikeDomain = (s: string) => /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(s.trim());
const DANGEROUS_FILE = /\.(exe|scr|bat|cmd|com|js|jse|vbs|ps1|apk|msi|jar|iso|img|lnk|hta)$/i;

// Attacks visible only in links and attachments. Pure, like checkRules.
export function deepRules({ sender = "", links = [], linkPairs = [], attachments = [] }: { sender?: string; links?: string[]; linkPairs?: LinkPair[]; attachments?: string[] }): Flag[] {
  const flags: Flag[] = [];
  const add = (code: string, level: Level, text: string) => flags.push({ code, level, text });

  for (const { text, href } of linkPairs) {
    const shown = looksLikeDomain(text) ? hostOf(text.trim()) : null;
    const real = hostOf(href);
    if (shown && real && !isOn(real, [shown]) && !isOn(shown, [real])) add("HIDDEN_LINK", "high", `A link shows ${shown} but really goes to ${real}.`);
  }
  const hosts = [...new Set([...links, ...linkPairs.map((l) => l.href)].map(hostOf).filter((h): h is string => !!h))];
  for (const h of hosts) {
    const name = imitatedCompany(h);
    if (h.split(".").some((p) => p.startsWith("xn--"))) add("HOMOGRAPH_LINK", "high", `A link uses disguised characters in its address (${h}).`);
    else if (name) add("LOOKALIKE_LINK", "high", `The link ${h} imitates ${name[0].toUpperCase() + name.slice(1)}'s website.`);
  }
  const senderAddress = addressOf(sender);
  const senderHost = senderAddress.includes("@") ? senderAddress.split("@").pop()! : "";
  const imitated = senderHost && imitatedCompany(senderHost);
  if (imitated) add("LOOKALIKE_DOMAIN", "high", `${senderHost} imitates ${imitated[0].toUpperCase() + imitated.slice(1)}'s domain.`);
  if (senderHost.split(".").some((p) => p.startsWith("xn--"))) add("LOOKALIKE_DOMAIN", "high", `The sender's domain uses disguised characters (${senderHost}).`);

  for (const name of attachments) {
    if (DANGEROUS_FILE.test(name.trim())) add("DANGEROUS_ATTACHMENT", "high", `The attachment "${name.slice(0, 60)}" is a program, not a document.`);
    else if (/\.html?$/i.test(name.trim())) add("DANGEROUS_ATTACHMENT", "medium", `The attachment "${name.slice(0, 60)}" is a web page, a common way to fake a login screen.`);
    else if (/\.(zip|rar|7z|tar|gz|docm|xlsm|pptm)$/i.test(name.trim())) add("DANGEROUS_ATTACHMENT", "medium", `The attachment "${name.slice(0, 60)}" can hide a program. Don't open it until you've verified the sender.`);
  }
  return flags;
}

// What sender proof can settle: these depend on who's writing, so a proven office sender clears them.
const SOFT_FOR_TRUSTED = ["OUTSIDE_FORM", "LINK_MISMATCH", "WRONG_DOMAIN", "COMPANY_DOMAIN_MISMATCH", "TOO_GOOD", "REALITY_CHECK", "URGENCY", "HACKED_ACCOUNT"];
// authenticated: DMARC proved the From address. genuine: the placement cell vouched for this sender.
export type SenderContext = { authenticated?: boolean; genuine?: boolean; aiChecked?: boolean }; // aiChecked: the AI read this mail

export function checkRules(text: string, sender = "", links: string[] = [], blockedDomains: string[] = [], extra: Flag[] = [], context: SenderContext = {}): CheckResult {
  const flags: Flag[] = [];
  const add = (code: string, level: Level, msg: string) => flags.push({ code, level, text: msg });
  const jobby = JOBBY.test(text);

  // --- what the mail asks you to do ---
  const shareVerb = /\b(shar(e|es|ed|ing)|send(s|ing)?|repl(y|ies|ying)|provid(e|ing)|tell|forward(ing)?|enter(ing)?|submit(ting)?|give|giving|mention|fill(ing)?)\b/i;
  // "pin" alone would hit "PIN code" in addresses, so only UPI/ATM/card PINs count.
  // A courier's door code is the one code you do hand over. Everything else stays high, whatever the AI says.
  const doorCode = /\b(delivery (partner|agent|person|executive)|courier|at your door)\b/i.test(text) && /\botp\b/i.test(text) && !/\b(password|passcode|pin|cvv|card|bank|login)\b/i.test(text);
  const secretLevel: Level = context.aiChecked && doorCode && !JOB_CONTEXT.test(text) ? "medium" : "high";
  if (asks(text, SECRET, shareVerb) || (CODE_SENT.test(text) && asks(text, THE_CODE, PASS_BACK)))
    add("ASKS_SECRET", secretLevel, "It asks you to share an OTP or password. No real recruiter ever needs this.");
  // Matches money *you* pay (fee/deposit, "pay ₹500"), not salary text like "pay of ₹20,000".
  const feeText = text.replace(SETTLED_FEE, " ").replace(FEE_WARNING, " ").replace(NO_FEE_PROMISE, " ");
  const moneyAsked = asks(feeText, /\b(fee|fees|deposit|charges(?!\s+(no|zero|nothing)\b))\b|\b(pay|transfer|deposit)\s+(rs\.?|₹|inr|\d)/i) || asksForMoney(feeText);
  if (moneyAsked && JOB_CONTEXT.test(text)) add("ASKS_FEE", "high", "It asks you to pay money. Real companies don't charge you to get hired.");
  else if (moneyAsked && !context.aiChecked) add("PAYMENT_NOTICE", "medium", "It mentions a payment, and the AI couldn't review this mail. Be sure you know the sender.");
  if (asks(text, ID_OR_BANK, shareVerb))
    add("ASKS_DOCUMENTS", "high", "It asks for ID or bank details over mail before any formal process.");
  if (asks(text, /\b(whatsapp|telegram)\b/i, /\b(contact|message|join|reply|add|text|ping|dm)\b/i))
    add("MOVE_TO_CHAT", "medium", "It moves the conversation to WhatsApp/Telegram, away from official channels.");
  if (/\bno (interview|test|assessment)\b|\bwithout (any )?(interview|test)\b|\byou (have been|are|were) (directly )?selected\b/i.test(text))
    add("TOO_GOOD", "medium", "It says you're selected without any interview, which real hiring doesn't do.");
  if (CREDENTIALS.test(text)) add("ASKS_LOGIN", "medium", "It pushes you to verify an account, a common way to steal passwords.");
  if (/\b(within \d+ ?(hours?|hrs|minutes?)|immediately|urgent(ly)?|last chance|today only|expires? (today|tonight|soon))\b/i.test(text))
    add("URGENCY", "low", "It pushes you to act fast, a common pressure trick.");

  // --- who sent it ---
  const senderAddr = addressOf(sender);
  const senderHost = senderAddr.includes("@") ? senderAddr.split("@").pop()! : "";
  const company = claimedCompany(text);
  const onCollege = !!senderHost && isOn(senderHost, [COLLEGE_DOMAIN]);
  const verifiedCollege = !!context.authenticated && onCollege;
  const office = verifiedCollege && OFFICE_ACCOUNT.test(senderAddr.split("@")[0]);
  const trusted = office || (!!context.authenticated && !!context.genuine);
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
    } else if (!onCollege) {
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
  if (onCollege && !PLACEMENT_SENDERS.includes(senderAddr) && jobby && (company || formHost || hosts.length))
    add("HACKED_ACCOUNT", "medium", "This is a personal college account, not a college office. Offers usually come from the placement cell, so confirm with the sender first.");

  flags.unshift(...extra); // proof beats pattern matching for the two reasons on the card

  if (trusted) {
    for (let i = flags.length - 1; i >= 0; i--) if (SOFT_FOR_TRUSTED.includes(flags[i].code)) flags.splice(i, 1);
    // College posters are often just images, so a proven office keeps its tick, but the card never vouches for what it couldn't read.
    flags.forEach((f, i) => {
      if (f.code === "BODY_NOT_READ") flags[i] = { ...f, level: "low" };
    });
    const fee = flags.findIndex((f) => f.code === "ASKS_FEE");
    if (fee >= 0) flags[fee] = { code: "PAYMENT_NOTICE", level: "medium", text: "A verified college office mentions a payment." };
  }
  // Sender proof can't excuse these: a hacked account passes every check.
  if (verifiedCollege && flags.some((f) => ["ASKS_SECRET", "ASKS_DOCUMENTS"].includes(f.code)))
    flags.unshift({ code: "HACKED_ACCOUNT", level: "high", text: "This really came from a college account, but college offices never ask for this by mail. The account may be hacked." });

  // dedupe by code, keeping the most severe
  const unique = [...flags].sort((a, b) => RANK[b.level] - RANK[a.level]).filter((f, i, all) => all.findIndex((g) => g.code === f.code) === i);
  const level: Level = unique.length ? unique[0].level : "low";
  const top = unique[0];
  const note = office
    ? `Verified college office: ${senderAddr}. It passed the sender checks.`
    : verifiedCollege
      ? `Verified college account: ${senderAddr}. It passed the sender checks.`
      : trusted
        ? `Your placement cell marked ${senderAddr} as genuine, and it passed the sender checks.`
        : null;

  return {
    level,
    reasons: level === "low" && note ? [note, ...unique.slice(0, 1).map((f) => f.text)] : unique.length ? unique.slice(0, 2).map((f) => f.text) : ["No common warning signs found in this text. That doesn't prove it's real."],
    nextStep: level === "low" ? (trusted && !unique.some((f) => f.code === "BODY_NOT_READ") ? TRUSTED_NEXT : verifiedCollege ? COLLEGE_NEXT : LOW_NEXT) : (NEXT_STEP[top.code] ?? DEFAULT_NEXT),
    intent: intentOf(unique, text, !!formHost, hosts.length > 0),
    flags: unique,
    evidence: {
      sender: senderEvidence ?? unique.find((f) => ["FREE_MAIL_CLAIM", "LOOKALIKE_DOMAIN", "WRONG_DOMAIN", "COMPANY_DOMAIN_MISMATCH", "BLOCKED_SENDER", "HACKED_ACCOUNT"].includes(f.code))?.text ?? (trusted || verifiedCollege ? note : null),
      company: null,
      link: ["FORM_ASKS_DATA", "FORM_MISMATCH", "FORM_READ", "RAW_IP_LINK", "SHORT_LINK_TARGET", "SHORT_LINK", "LINK_NOT_CHECKED", "LINK_MISMATCH", "OUTSIDE_FORM"].map((c) => unique.find((f) => f.code === c)?.text).find(Boolean) ?? null,
    },
    sources: [],
    attack: attackOf(unique),
    checks: [],
    mode: "limited",
  };
}

const ATTACKS: [string, string][] = [
  ["DANGEROUS_ATTACHMENT", "Malware attachment"],
  ["ASKS_SECRET", "OTP or password theft"],
  ["FORM_ASKS_DATA", "Phishing form"],
  ["KNOWN_MALICIOUS", "Known phishing or malware site"],
  ["ASKS_FEE", "Advance-fee scam"],
  ["ASKS_DOCUMENTS", "Identity theft"],
  ["REMOTE_ACCESS", "Remote access scam"],
  ["MONEY_MULE", "Money mule scam"],
  ["ASKS_LOGIN", "Account phishing"],
  ["AUTH_FAIL", "Email spoofing"],
  ["HIDDEN_LINK", "Disguised link phishing"],
  ["HOMOGRAPH_LINK", "Homograph attack"],
  ["LOOKALIKE_DOMAIN", "Brand impersonation"],
  ["LOOKALIKE_LINK", "Brand impersonation"],
  ["HACKED_ACCOUNT", "Possible account takeover"],
  ["REPLY_TO_MISMATCH", "Reply hijacking"],
];
const attackOf = (flags: Flag[]) => ATTACKS.find(([code]) => flags.some((f) => f.code === code && f.level !== "low"))?.[1] ?? null;

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
