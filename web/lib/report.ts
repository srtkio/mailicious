// Turns the flags into the plain security report the card shows.
import type { Flag, SecurityCheck } from "./types";

const GROUPS: { label: string; codes: string[]; pass: string; needs: "sender" | "links" | null }[] = [
  { label: "Sender identity", codes: ["AUTH_FAIL", "FREE_MAIL_CLAIM", "WRONG_DOMAIN", "LOOKALIKE_DOMAIN", "COMPANY_DOMAIN_MISMATCH", "BLOCKED_SENDER", "HACKED_ACCOUNT"], pass: "The sender's address fits who they claim to be.", needs: "sender" },
  { label: "Links", codes: ["HIDDEN_LINK", "HOMOGRAPH_LINK", "LOOKALIKE_LINK", "RAW_IP_LINK", "SHORT_LINK", "SHORT_LINK_TARGET", "LINK_MISMATCH", "LINK_NOT_CHECKED"], pass: "The links go where they should.", needs: "links" },
  { label: "Forms", codes: ["FORM_ASKS_DATA", "FORM_MISMATCH", "OUTSIDE_FORM"], pass: "No risky form found.", needs: null },
  { label: "Attachments", codes: ["DANGEROUS_ATTACHMENT"], pass: "No dangerous attachment found.", needs: null },
  { label: "What it asks for", codes: ["ASKS_SECRET", "ASKS_FEE", "ASKS_DOCUMENTS", "MOVE_TO_CHAT"], pass: "It doesn't ask for money, codes or ID.", needs: null },
  { label: "Does the offer add up", codes: ["TOO_GOOD", "REALITY_CHECK", "URGENCY"], pass: "Nothing about the offer looks off.", needs: null },
];

export function securityReport(flags: Flag[], extra: SecurityCheck[], given: { sender: boolean; links: boolean; headers: boolean }): SecurityCheck[] {
  const rules = GROUPS.map(({ label, codes, pass, needs }): SecurityCheck => {
    const hit = flags.find((f) => codes.includes(f.code));
    if (hit) return { label, status: hit.level === "high" ? "fail" : "warn", detail: hit.text };
    if (needs && !given[needs]) return { label, status: "skip", detail: needs === "sender" ? "No sender address given." : "No links found." };
    return { label, status: "pass", detail: pass };
  });
  const auth: SecurityCheck[] = given.headers ? [] : [{ label: "Sender authentication", status: "skip", detail: "Needs the original mail. Use the extension, or paste Gmail's Show original." }];
  return [...auth, ...extra, ...rules];
}
