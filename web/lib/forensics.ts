// Offer Letter X-ray: tests a PDF's text and internals. It runs in the browser, so the letter never leaves the student's device.
import type { Level } from "./types";

export type PdfFacts = {
  text: string;
  pages: number;
  producer?: string;
  creator?: string;
  created?: Date | null;
  modified?: Date | null;
  active: string[]; // scripts or launch actions found in the raw file
};
export type Finding = { label: string; status: "pass" | "warn" | "fail"; detail: string };
export type LetterReport = { level: Level; findings: Finding[] };

const BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// The last character of a GSTIN is a check digit, so a made-up number nearly always fails.
export function validGstin(gstin: string): boolean {
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) return false;
  const state = Number(gstin.slice(0, 2));
  if (!((state >= 1 && state <= 38) || state === 97 || state === 99)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = BASE36.indexOf(gstin[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return BASE36[(36 - (sum % 36)) % 36] === gstin[14];
}

const CIN_STATES = "AN AP AR AS BR CG CH CT DD DL DN GA GJ HP HR JH JK KA KL LA LD MH ML MN MP MZ NL OD OR PB PY RJ SK TG TN TR TS UK UP UR UT WB".split(" ");
const CIN_TYPES = "PTC PLC OPC FTC FLC GOI SGC NPL GAP GAT ULL ULT".split(" ");

// A CIN spells out its own facts: listed or unlisted, state, year founded, company type.
export function validCin(cin: string, year = new Date().getFullYear()): boolean {
  const m = /^[LU]\d{5}([A-Z]{2})(\d{4})([A-Z]{3})\d{6}$/.exec(cin);
  return !!m && CIN_STATES.includes(m[1]) && Number(m[2]) >= 1850 && Number(m[2]) <= year && CIN_TYPES.includes(m[3]);
}

// PDF dates look like D:20260312101500+05'30'.
export function pdfDate(value: unknown): Date | null {
  const m = /^(?:D:)?(\d{4})(\d{2})(\d{2})/.exec(String(value ?? ""));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
const DATE = /\b(\d{1,2})(?:st|nd|rd|th)?[ -]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?[ -]+(\d{4})\b|\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/i;

// The date written on the letter. Indian letters write day first.
export function letterDate(text: string): Date | null {
  const m = DATE.exec(text);
  if (!m) return null;
  return m[1] ? new Date(Date.UTC(+m[3], MONTHS.indexOf(m[2].toLowerCase()), +m[1])) : new Date(Date.UTC(+m[6], +m[5] - 1, +m[4]));
}

const DESIGN_TOOL = /\b(canva|picsart|photoshop|illustrator|coreldraw|ilovepdf|smallpdf|sejda|pdfescape|pdf24|sodapdf|pdfelement|foxit phantom|wps)\b/i;
const PAY_ASK = /\b(?:registration|security|refundable|caution|processing|training|joining|uniform|laptop|verification|onboarding|document(?:ation)?)\s+(?:fees?|deposit|charges?|amount)\b|\bpay(?:ment)?\s+(?:of\s+)?(?:rs\.?|inr|₹)\s*[\d,]+/i;
const UPI = /\b[\w.-]{2,64}@(?:ybl|ibl|axl|upi|paytm|apl|okaxis|okhdfcbank|okicici|oksbi|icici|hdfcbank|sbi)\b/i;
const FREE_MAIL = /\b[\w.+-]{1,64}@(?:gmail|yahoo|outlook|hotmail|rediffmail|proton|protonmail)\.[a-z.]+\b/i;
const SECRETS = /\b(?:otp|aadhaa?r|pan card|bank (?:details|account)|cvv|atm pin|upi pin)\b/i;
const DAY = 86_400_000;
const MAX_TEXT = 60_000; // a letter is a page or two, and a crafted PDF mustn't hang the tab

export function auditLetter(facts: PdfFacts): LetterReport {
  const text = facts.text.slice(0, MAX_TEXT).replace(/\s+/g, " ").trim();
  const upper = text.toUpperCase();
  const findings: Finding[] = [];
  const add = (label: string, status: Finding["status"], detail: string) => findings.push({ label, status, detail });

  if (facts.active.length) add("Hidden actions", "fail", `This PDF carries ${facts.active.join(" and ")}. A letter has no reason to run anything.`);
  else add("Hidden actions", "pass", "No scripts, launch actions or embedded files inside the PDF.");

  if (!text) add("Readable text", "warn", "It's only a picture of a letter, so nothing in it could be read or tested.");

  const made = [facts.producer, facts.creator].filter(Boolean).join(" ");
  const tool = DESIGN_TOOL.exec(made)?.[1];
  if (tool) add("How it was made", "warn", `Built in ${tool[0].toUpperCase()}${tool.slice(1)}, a design or online PDF tool. Company HR systems rarely produce letters this way.`);
  else if (made) add("How it was made", "pass", `Produced by ${made.slice(0, 60)}.`);
  else add("How it was made", "warn", "The file's maker has been removed, which is unusual for a real company letter.");

  const written = letterDate(text);
  if (written && facts.created) {
    const days = Math.round(Math.abs(facts.created.getTime() - written.getTime()) / DAY);
    if (days > 7) add("Dates", "warn", `The letter is dated ${days} days away from when this file was actually created.`);
    else add("Dates", "pass", "The date on the letter fits when the file was created.");
  }
  if (facts.created && facts.modified && facts.modified.getTime() - facts.created.getTime() > DAY) add("Edited later", "warn", "This file was changed after it was first made.");

  const gstins = [...new Set(upper.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]{3}\b/g) ?? [])];
  const badGst = gstins.find((g) => !validGstin(g));
  if (badGst) add("GST number", "fail", `${badGst} fails its check digit, so this number can't exist.`);
  else if (gstins.length) add("GST number", "pass", "Its check digit is valid. Confirm the company name at gst.gov.in.");

  const cins = [...new Set(upper.match(/\b[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b/g) ?? [])];
  const badCin = cins.find((c) => !validCin(c));
  if (badCin) add("Company number", "fail", `${badCin} isn't a valid CIN: its state, year or company type doesn't exist.`);
  else if (cins.length) add("Company number", "pass", "The CIN has a valid structure. Confirm the company at mca.gov.in.");
  else if (text) add("Company number", "warn", "No CIN found. Indian companies must print it on their business letters.");

  const upi = UPI.exec(text)?.[0];
  if (upi) add("Payment details", "fail", `It contains the UPI ID ${upi}. No employer collects money through an offer letter.`);
  else if (PAY_ASK.test(text)) add("Payment details", "fail", "It asks you to pay. Real employers don't charge you to join.");
  else if (text) add("Payment details", "pass", "It doesn't ask you to pay anything.");

  const mail = FREE_MAIL.exec(text)?.[0];
  if (mail) add("Contact address", "warn", `The contact is ${mail}, a personal mailbox rather than a company one.`);
  if (SECRETS.test(text)) add("Private details", "warn", "It mentions OTPs, ID or bank details. Hand these over only after you've verified the company.");

  const level: Level = findings.some((f) => f.status === "fail") ? "high" : findings.some((f) => f.status === "warn") ? "medium" : "low";
  return { level, findings: findings.sort((a, b) => "fwp".indexOf(a.status[0]) - "fwp".indexOf(b.status[0])) };
}

// Raw-file markers of active content. Plain scanning, because a PDF reader's job is to hide these.
export function activeContent(bytes: Uint8Array): string[] {
  const raw = new TextDecoder("latin1").decode(bytes);
  const seen: string[] = [];
  if (/\/(JavaScript|JS)\b/.test(raw)) seen.push("a script");
  if (/\/Launch\b/.test(raw)) seen.push("a launch action");
  if (/\/EmbeddedFile\b/.test(raw)) seen.push("an embedded file");
  return seen;
}
