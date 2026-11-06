// Fixture checks for the rules engine. All messages and addresses are fictional.
import { describe, expect, it } from "vitest";
import { addressOf, checkRules, deepRules, looseAddress } from "./engine";

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

describe("sender context", () => {
  const authenticated = { authenticated: true };
  const form = "Please fill this feedback form for the career session: https://forms.gle/abc";
  const codes = (r: { flags: { code: string }[] }) => r.flags.map((f) => f.code);

  it("trusts a verified college office, including on a subdomain", () => {
    for (const sender of ["learnercareercouncil@nst.rishihood.edu.in", "robotics.club@rishihood.edu.in", "director.academics@nst.rishihood.edu.in", "library@rishihood.edu.in"]) {
      const r = checkRules(`${form} Interview tips included.`, sender, [], [], [], authenticated);
      expect(r.level, sender).toBe("low");
      expect(r.reasons[0]).toContain("Verified college office");
      expect(r.nextStep).toContain("looks genuine");
    }
  });
  it("gives no trust without proof, whatever the address says", () => {
    const r = checkRules(`${form} Interview tips.`, "placement.office@nst.rishihood.edu.in");
    expect(r.level).toBe("medium");
    expect(checkRules(`${form} Interview tips.`, "placement@rishihood-jobs.example", [], [], [], authenticated).level).toBe("medium");
  });
  it("asks a verified personal account to be confirmed when it pushes an outside offer", () => {
    const r = checkRules("Google internship offer! Apply on this form: https://forms.gle/abc", "manjistha.b@rishihood.edu.in", [], [], [], authenticated);
    expect(r.level).toBe("medium");
    expect(codes(r)).toContain("HACKED_ACCOUNT");
  });
  it("calls out a hacked account when a verified sender asks for an OTP", () => {
    for (const sender of ["manjistha.b@rishihood.edu.in", "learnercareercouncil@nst.rishihood.edu.in"]) {
      const r = checkRules("Please share the OTP you received.", sender, [], [], [], authenticated);
      expect(r.level).toBe("high");
      expect(r.reasons[0]).toContain("may be hacked");
    }
  });
  it("turns a verified office's fee into portal advice, but only for an office", () => {
    const office = checkRules("The program fee of Rs 2,000 is payable this week.", "learnercareercouncil@nst.rishihood.edu.in", [], [], [], authenticated);
    expect(office.level).toBe("medium");
    expect(office.nextStep).toContain("college portal");
    expect(office.attack).toBeNull();
    expect(checkRules("The program fee of Rs 2,000 is payable.", "manjistha.b@rishihood.edu.in", [], [], [], authenticated).level).toBe("high");
  });
  it("trusts a sender the placement cell vouched for only with proof", () => {
    const text = "Microsoft internship interview next week.";
    expect(checkRules(text, "hr@partner.example", [], [], [], { authenticated: true, genuine: true }).level).toBe("low");
    expect(checkRules(text, "hr@partner.example", [], [], [], { genuine: true }).level).toBe("medium");
  });
  it("keeps a verified office's image mail low, without vouching for it", () => {
    const unread = [{ code: "BODY_NOT_READ", level: "medium" as const, text: "Mostly images." }];
    const office = checkRules("Poster", "library@rishihood.edu.in", [], [], unread, authenticated);
    expect(office.level).toBe("low");
    expect(office.reasons).toContain("Mostly images.");
    expect(office.nextStep).not.toContain("looks genuine");
    expect(checkRules("Poster", "hr@acme.example", [], [], unread, authenticated).level).toBe("medium");
  });
  it("never lets trust clear a dangerous attachment or a blocklisted sender", () => {
    const extra = [{ code: "DANGEROUS_ATTACHMENT", level: "high" as const, text: "x" }];
    expect(checkRules("Hello.", "library@rishihood.edu.in", [], [], extra, authenticated).level).toBe("high");
    expect(checkRules("Hello.", "library@rishihood.edu.in", [], ["rishihood.edu.in"], [], authenticated).level).toBe("high");
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
    expect(level("Internship fee waived if you pay Rs 500 today.")).toBe("high");
    expect(level("For the assignment, share the code on GitHub.")).toBe("low");
    expect(level("We sent an SMS with the venue. Enter your PIN code in the portal.")).toBe("low");
    expect(level("Internship fee waived if you pay the ₹500 deposit.")).toBe("high");
    expect(level("Job kit: pay a deposit of ₹1500, late charges are waived.")).toBe("high");
    expect(level("Your salary is Rs 50,000. The kit costs ₹500, kindly pay today.")).toBe("high");
    expect(level("The kit costs ₹500 against your stipend, kindly transfer it.")).toBe("high");
    expect(level("We sent a PIN code to your mobile, reply with it.")).toBe("high");
    expect(level("We sent a referral code to your phone. Please forward that code.")).toBe("high");
    expect(level("Please share your mobile number and resume.")).toBe("low");
    expect(level("Enter the code sent to your phone on the portal.")).toBe("low");
    expect(level("If anyone asks you for a fee, tell the placement cell.")).toBe("low");
    expect(level("For the job, if anyone asks you for a fee, pay the deposit of Rs 500 to us.")).toBe("high");
    expect(level("Stipend is Rs 25,000 per month, paid on the 5th.")).toBe("low");
    expect(level("We will pay you Rs 30,000 and the travel allowance of Rs 2,000 after joining.")).toBe("low");
    expect(level("The fee is included in your semester fees. You do not need to pay anyone.")).toBe("low");
  });
  it("holds up against the review's bypasses", () => {
    const level = (t: string) => checkRules(t).level;
    expect(level("Job kit costs Rs899, kindly transfer it.")).toBe("high");
    expect(level("Internship kit costs INR1999, pay today.")).toBe("high");
    expect(level("For your internship the amount to be paid is ₹899 today.")).toBe("high");
    expect(level("We sent a code to your phone. Please provide that code.")).toBe("high");
    expect(level("The joining fee of Rs 500 to pay now is waived after you transfer it.")).toBe("high");
    expect(level("If anyone asks you for a job fee, pay it.")).toBe("high");
    expect(level("If anyone asks you for a fee, report it to the cell.")).toBe("low");
    expect(level("The scheme charges no registration fee.")).toBe("low");
  });
  it("still sees a brand behind a tool name", () => {
    expect(checkRules("Google Meet intern offer: interview soon.", "hr@acme.example").flags.map((f) => f.code)).toContain("WRONG_DOMAIN");
    expect(checkRules("Microsoft Teams hiring now, interview next week.", "hr@acme.example").flags.map((f) => f.code)).toContain("WRONG_DOMAIN");
  });
  it("leaves money in ordinary mail to the AI, and honest no-fee promises alone", () => {
    const level = (t: string) => checkRules(t, "", [], [], [], { aiChecked: true }).level;
    expect(level("Your electricity bill of Rs 842 is due. Pay by 15 Nov to avoid a late fee.")).toBe("low");
    expect(level("Your ticket is confirmed. Fare Rs 755 paid, including convenience fee.")).toBe("low");
    expect(level("Bro, I forgot my wallet, can you send me Rs 500?")).toBe("low");
    expect(checkRules("Your electricity bill of Rs 842 is due. Pay by 15 Nov to avoid a late fee.").level).toBe("medium"); // no AI, so the rule still watches it
    expect(level("We never charge a fee but pay Rs 500 for your job kit.")).toBe("high");
    expect(level("Meridian does not charge a fee, except the recruitment deposit of Rs 500.")).toBe("high");
    expect(level("We are pleased to offer you the job. Meridian does not charge any fee at any stage of recruitment.")).toBe("low");
    expect(level("Our recruiters don't charge candidates any fee, but pay the deposit of Rs 500 for your job kit.")).toBe("high");
  });
  it("finds the last address in a broken sender for warnings only", () => {
    expect(looseAddress('"<placement@rishihood.edu.in> <evil@x.example>')).toBe("evil@x.example");
    expect(addressOf('"<placement@rishihood.edu.in> <evil@x.example>')).toBe("");
  });
  it("names no attack from a low note", () => {
    expect(checkRules("Hello.", "", [], [], [{ code: "REPLY_TO_MISMATCH", level: "low", text: "x" }]).attack).toBeNull();
  });
  it("reads senders with a display name", () => {
    expect(addressOf("Library <Library@rishihood.edu.in>")).toBe("library@rishihood.edu.in");
    expect(addressOf('"<placement@rishihood.edu.in>" <evil@x.example>')).toBe("evil@x.example");
    expect(addressOf("no address here")).toBe("");
    expect(deepRules({ sender: "Library <library@rishihood.edu.in>" })).toEqual([]);
    expect(checkRules("Book due Friday.", "Library <library@rishihood.edu.in>", [], [], [], { authenticated: true }).reasons[0]).toContain("Verified college office");
  });
  it("doesn't mistake receipts, seats or a friend's note for demands", () => {
    const level = (t: string) => checkRules(t, "", [], [], [], { aiChecked: true }).level;
    expect(level("Total paid: Rs 748. Cash on Delivery not selected.")).toBe("low");
    expect(level("Coach B3, Seat 41. Fare paid: Rs 2,415 including convenience fee.")).toBe("low");
    expect(level("I owe you Rs 200, will send on UPI tonight.")).toBe("low");
    expect(checkRules("You got the job. No genuine company charges candidates any fee for offers.").level).toBe("low");
  });
  it("keeps a caution on non-job code requests the AI cleared, and an alarm without the AI", () => {
    const delivery = "Share this OTP only with the delivery partner at your door.";
    expect(checkRules(delivery, "", [], [], [], { aiChecked: true }).level).toBe("medium");
    expect(checkRules(delivery).level).toBe("high");
    expect(checkRules("Internship: share this OTP.", "", [], [], [], { aiChecked: true }).level).toBe("high");
    expect(checkRules("Share the OTP to unlock your account.", "", [], [], [], { aiChecked: true }).level).toBe("high");
    expect(checkRules("Courier stuck. Share your bank OTP with the delivery agent.", "", [], [], [], { aiChecked: true }).level).toBe("high");
    expect(checkRules("Send your Aadhaar number by mail.", "", [], [], [], { aiChecked: true }).level).toBe("high");
    expect(checkRules("Send me your UPI number and IFSC.", "", [], [], [], { aiChecked: true }).level).toBe("high");
  });
  it("can't clear a demand through a no-fee promise", () => {
    const level = (t: string) => checkRules(t, "", [], [], [], { aiChecked: true }).level;
    expect(level("For this job we don't charge a fee besides the Rs1500 kit, kindly pay.")).toBe("high");
    expect(level("We never charge any fee other than the job deposit of Rs 900, pay today.")).toBe("high");
    expect(level("For your job, no genuine firm charges you fee unless we say so, so pay our fee now.")).toBe("high");
  });
  it("doesn't read a tool as a claim to be its maker", () => {
    expect(checkRules("Your interview is on Google Meet.", "hr@acme.example").level).toBe("low");
    expect(checkRules("Google internship: interview on Google Meet.", "hr@acme.example").flags.map((f) => f.code)).toContain("WRONG_DOMAIN");
  });
  it("catches a look-alike of the college and archives", () => {
    expect(deepRules({ sender: "it@rishihood-support.example" })[0].code).toBe("LOOKALIKE_DOMAIN");
    expect(deepRules({ sender: "it@rishihood.edu.in" })).toEqual([]);
    expect(deepRules({ attachments: ["offer.zip"] })[0].level).toBe("medium");
  });
  it("names the attack on the result", () => {
    expect(checkRules("Internship: pay the registration fee of Rs 500.").attack).toBe("Advance-fee scam");
    expect(checkRules("Hello there.").attack).toBeNull();
  });
});
