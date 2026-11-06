// Contract for POST /api/check, shared by the website and the extension.

export type Level = "low" | "medium" | "high";

export type Intent =
  | "share_otp"
  | "pay_fee"
  | "share_documents"
  | "fill_form"
  | "move_to_chat"
  | "click_link"
  | "apply_on_portal"
  | "unknown";

export type Flag = {
  code: string; // e.g. "ASKS_OTP"
  level: Level; // the minimum risk this flag forces
  text: string; // plain-English reason shown to the student
};

export type LinkPair = { text: string; href: string }; // what a link shows vs where it goes

export type CheckRequest = {
  text?: string;
  sender?: string;
  links?: string[];
  raw?: string; // a full original message (.eml or Gmail "Show original"); replaces text when given
  headers?: string; // just the message headers, as the extension sends them
  linkPairs?: LinkPair[];
  attachments?: string[];
  unreadBody?: boolean; // the extension found no readable text, so the mail is probably images
};

export type SecurityCheck = {
  label: string; // "Sender authentication"
  status: "pass" | "warn" | "fail" | "skip";
  detail: string; // one plain sentence
};

export type CheckResult = {
  level: Level;
  reasons: string[]; // max 2, shown on the card
  nextStep: string;
  intent: Intent;
  flags: Flag[]; // everything found, for the "Why?" drawer
  evidence: {
    sender: string | null; // "Claims Microsoft but sent from gmail.com"
    company: string | null; // web-RAG summary (null until search is wired)
    link: string | null; // link/form check summary
  };
  sources: { title: string; url: string }[];
  attack: string | null; // the kind of attack, e.g. "Advance-fee scam"
  checks: SecurityCheck[]; // the security report
  mode: "full" | "limited"; // limited = rules only (no AI/search)
  sender?: string; // the address checked, for reporting
};
