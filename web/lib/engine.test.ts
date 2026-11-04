// Fixture checks for the rules engine. All messages and addresses are fictional.
import { describe, expect, it } from "vitest";
import { checkRules } from "./engine";

const cases: { name: string; text: string; sender?: string; blocked?: string[]; level: string; code?: string }[] = [
  { name: "asks for OTP", text: "Congratulations on your selection. Please share the OTP sent to your phone to confirm.", level: "high", code: "ASKS_SECRET" },
  { name: "warning not to share OTP is fine", text: "Interview on Monday at 10am. Never share your OTP or password with anyone.", sender: "careers@microsoft.com", level: "low" },
  { name: "asks for a fee", text: "Pay a refundable registration fee of Rs 1500 to block your internship seat.", level: "high", code: "ASKS_FEE" },
  { name: "salary mention is not a fee", text: "Interview round on Friday. Stipend: pay of ₹20,000 per month. Apply on the careers portal.", sender: "jobs@infosys.com", level: "low" },
  { name: "asks for bank details", text: "Send your bank account number and IFSC for stipend setup.", level: "high", code: "ASKS_DOCUMENTS" },
  { name: "PIN code in address is not a secret", text: "Interview at our office. Enter your address with PIN code in the form on the careers portal.", sender: "jobs@tcs.com", level: "low" },
  { name: "Microsoft claim from gmail", text: "Microsoft internship offer for your batch. Interview next week.", sender: "hr.microsoft.india@gmail.com", level: "medium", code: "FREE_MAIL_CLAIM" },
  { name: "lookalike domain", text: "Microsoft is hiring interns. Apply now.", sender: "hr@micros0ft-careers.co", level: "high", code: "LOOKALIKE_DOMAIN" },
  { name: "hacked college account with form", text: "Amazon internship for 2nd years! Fill this form fast: https://forms.gle/abc123", sender: "rahul.k@rishihood.edu.in", level: "medium", code: "HACKED_ACCOUNT" },
  { name: "placement cell sending the same is fine", text: "Amazon internship drive. Apply on the careers portal by Friday.", sender: "placement@rishihood.edu.in", level: "low" },
  { name: "shortened link", text: "Your internship offer letter: bit.ly/offer-2026", level: "medium", code: "SHORT_LINK" },
  { name: "link to wrong site", text: "Google internship. Apply at https://google-jobs-apply.example/form", sender: "careers@google.com", level: "medium", code: "LINK_MISMATCH" },
  { name: "selected without interview", text: "You have been selected for a Wipro role. No interview needed.", level: "medium", code: "TOO_GOOD" },
  { name: "urgency alone is not high", text: "Reminder: the Deloitte application deadline is today only. Apply on the careers portal.", sender: "careers@deloitte.com", level: "low", code: "URGENCY" },
  { name: "reported sender", text: "Interview invite attached.", sender: "hr@fasthire.example", blocked: ["fasthire.example"], level: "high", code: "BLOCKED_SENDER" },
  { name: "whatsapp move", text: "For your offer, message our HR on WhatsApp at the number below.", level: "medium", code: "MOVE_TO_CHAT" },
];

describe("checkRules", () => {
  for (const c of cases) {
    it(c.name, () => {
      const r = checkRules(c.text, c.sender, [], c.blocked);
      expect(r.level).toBe(c.level);
      if (c.code) expect(r.flags.map((f) => f.code)).toContain(c.code);
      expect(r.reasons.length).toBeGreaterThan(0);
      expect(r.reasons.length).toBeLessThanOrEqual(2);
      expect(r.mode).toBe("limited");
    });
  }

  it("high floor wins over an official sender", () => {
    const r = checkRules("Microsoft internship: share the OTP you received to verify.", "careers@microsoft.com");
    expect(r.level).toBe("high");
    expect(r.intent).toBe("share_otp");
  });
});
