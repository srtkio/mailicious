// A full-mode example result so the extension and UI can build the card + "Why?" drawer before the AI/search steps exist.
import type { CheckResult } from "./types";

export const MOCK_RESULT: CheckResult = {
  level: "high",
  reasons: [
    "It asks you to share an OTP or password. No real recruiter ever needs this.",
    "It claims to be Microsoft but was sent from a personal gmail.com address.",
  ],
  nextStep: "Do not share the code or password with anyone. Verify with the placement cell before replying.",
  intent: "share_otp",
  flags: [
    { code: "ASKS_SECRET", level: "high", text: "It asks you to share an OTP or password. No real recruiter ever needs this." },
    { code: "FREE_MAIL_CLAIM", level: "medium", text: "It claims to be Microsoft but was sent from a personal gmail.com address." },
    { code: "URGENCY", level: "low", text: "It pushes you to act fast, a common pressure trick." },
  ],
  evidence: {
    sender: "It claims to be Microsoft but was sent from a personal gmail.com address.",
    company: "Microsoft's careers site lists internships, but applications go through careers.microsoft.com, never by email or OTP.",
    link: "The link is shortened (bit.ly), so you can't see where it really goes.",
  },
  attack: "OTP or password theft",
  checks: [{ label: "Sender authentication", status: "fail", detail: "DMARC failed: this mail isn't really from microsoft.com." }],
  sources: [{ title: "Microsoft Careers (example source)", url: "https://careers.microsoft.com" }],
  mode: "full",
};
