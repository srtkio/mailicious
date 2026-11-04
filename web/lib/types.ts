// Frozen contract for POST /api/check. Change only with the whole team's agreement.

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

export type CheckRequest = {
  text: string;
  sender?: string;
  links?: string[];
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
  mode: "full" | "limited"; // limited = rules only (no AI/search)
};
