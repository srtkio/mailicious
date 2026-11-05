// Fixture checks for the rules engine. All messages and addresses are fictional.
import { describe, expect, it } from "vitest";
import { checkRules, deepRules } from "./engine";

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
  { name: "negation bypass: don't worry, share OTP", text: "Don't worry, just share the OTP you received with our HR.", level: "high", code: "ASKS_SECRET" },
  { name: "negation bypass: don't delay sharing", text: "Do not delay sharing the OTP with us.", level: "high", code: "ASKS_SECRET" },
  { name: "negation bypass: but clause", text: "We never charge students but please pay Rs 500 to confirm your slot.", level: "high", code: "ASKS_FEE" },
  { name: "bypass: comma splits verb from object", text: "Share, by tonight, your OTP with the recruiter.", level: "high", code: "ASKS_SECRET" },
  { name: "bypass: second match not negated", text: "There is no fee for the interview and transfer Rs 500 for the kit.", level: "high", code: "ASKS_FEE" },
  { name: "bypass: 'without' plus a word", text: "Join without delay and pay the deposit today.", level: "high", code: "ASKS_FEE" },
  { name: "bypass: negated verb then real request", text: "Never share it with friends, send the OTP to HR only.", level: "high", code: "ASKS_SECRET" },
  { name: "no registration fee is fine", text: "Interview next week. There is no registration fee. Apply on the careers portal.", sender: "jobs@wipro.com", level: "low" },
  { name: "do not pay is fine", text: "Interview next week. Do not pay anyone claiming to be us. Apply on the careers portal.", sender: "jobs@tcs.com", level: "low" },
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

describe("deepRules", () => {
  const codes = (input: Parameters<typeof deepRules>[0]) => deepRules(input).map((f) => f.code);
  it("catches a link disguised as another site", () => {
    expect(codes({ linkPairs: [{ text: "careers.microsoft.com", href: "https://evil.example/login" }] })).toContain("HIDDEN_LINK");
    expect(codes({ linkPairs: [{ text: "Click here", href: "https://evil.example/" }] })).not.toContain("HIDDEN_LINK");
    expect(codes({ linkPairs: [{ text: "microsoft.com", href: "https://careers.microsoft.com/" }] })).toEqual([]);
  });
  it("catches look-alike and disguised addresses", () => {
    expect(codes({ links: ["https://micros0ft-careers.example/"] })).toContain("LOOKALIKE_LINK");
    expect(codes({ links: ["https://rnicrosoft.example/"] })).toContain("LOOKALIKE_LINK");
    expect(codes({ links: ["https://rnicrosoft-careers.example/"] })).toContain("LOOKALIKE_LINK");
    expect(codes({ links: ["https://xn--microsft-d1a.example/"] })).toContain("HOMOGRAPH_LINK");
    expect(codes({ links: ["https://careers.microsoft.com/"] })).toEqual([]);
  });
  it("catches a sender imitating a company the mail never names", () => {
    expect(codes({ sender: "hr@infosys-hiring.example" })).toContain("LOOKALIKE_DOMAIN");
    expect(codes({ sender: "hr@infosys.com" })).toEqual([]);
  });
  it("catches dangerous attachments", () => {
    expect(deepRules({ attachments: ["offer.pdf.exe"] })[0]).toMatchObject({ code: "DANGEROUS_ATTACHMENT", level: "high" });
    expect(deepRules({ attachments: ["login.html"] })[0].level).toBe("medium");
    expect(deepRules({ attachments: ["offer.pdf"] })).toEqual([]);
  });
  it("keeps the most severe flag when a code appears twice", () => {
    const r = checkRules("Hello.", "", [], [], deepRules({ attachments: ["cv.html", "run.exe"] }));
    expect(r.level).toBe("high");
  });
  it("catches codes and money that avoid the usual words, without crying wolf", () => {
    const level = (t: string) => checkRules(t).level;
    expect(level("We sent a code to your phone. Please forward that code to us.")).toBe("high");
    expect(level("Kit costs ₹500, returned with your first stipend. Kindly transfer it today.")).toBe("high");
    expect(level("Fee waived if you pay Rs 500 today.")).toBe("high");
    expect(level("For the assignment, share the code on GitHub.")).toBe("low");
    expect(level("We sent an SMS with the venue. Enter your PIN code in the portal.")).toBe("low");
    expect(level("Stipend is Rs 25,000 per month, paid on the 5th.")).toBe("low");
    expect(level("We will pay you Rs 30,000 and the travel allowance of Rs 2,000 after joining.")).toBe("low");
    expect(level("The fee is included in your semester fees. You do not need to pay anyone.")).toBe("low");
  });
  it("names the attack on the result", () => {
    expect(checkRules("Pay the registration fee of Rs 500.").attack).toBe("Advance-fee scam");
    expect(checkRules("Hello there.").attack).toBeNull();
  });
});
