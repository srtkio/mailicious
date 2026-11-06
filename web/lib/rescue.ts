// Damage Control: what to do once a student has already been caught. Ordered by what stops the harm soonest.
export const SLIPS = [
  ["money", "I paid money"],
  ["otp", "I shared an OTP"],
  ["id", "I shared Aadhaar, PAN or documents"],
  ["password", "I typed a password on their site"],
  ["file", "I opened a file or installed an app"],
  ["link", "I only clicked a link"],
] as const;
export type Slip = (typeof SLIPS)[number][0];

export type RescueStep = { when: "Right now" | "Within the hour" | "Today"; title: string; body: string; href?: string; action?: string };

const STEPS: Record<Slip, RescueStep[]> = {
  money: [
    { when: "Right now", title: "Call 1930", body: "India's national cybercrime helpline. Say you paid a scammer and give the transaction ID. The sooner you call, the better the chance of stopping the money.", href: "tel:1930", action: "Call 1930" },
    { when: "Right now", title: "Call your bank", body: "Use the number on your card or in your bank app. Ask them to block the card or UPI and raise a fraud dispute." },
    { when: "Within the hour", title: "File at cybercrime.gov.in", body: "Paste the complaint below and keep the acknowledgement number. Your bank will ask for it.", href: "https://cybercrime.gov.in", action: "Open the portal" },
  ],
  otp: [
    { when: "Right now", title: "Find out what the code unlocked", body: "Read the SMS again. If it came from a bank or UPI app, call that bank now and ask them to block transactions." },
    { when: "Right now", title: "Lock the account", body: "Change that account's password and sign out of every other device." },
    { when: "Within the hour", title: "Watch your statements", body: "If any money moves, call 1930 straight away.", href: "tel:1930", action: "Call 1930" },
  ],
  id: [
    { when: "Today", title: "Lock your Aadhaar biometrics", body: "Use myAadhaar or the mAadhaar app, and read your authentication history for anything you don't recognise.", href: "https://myaadhaar.uidai.gov.in", action: "Open myAadhaar" },
    { when: "Today", title: "Check your credit report", body: "A leaked PAN can be used for loans. Check for any you didn't take, then again next month." },
    { when: "Today", title: "File at cybercrime.gov.in", body: "Report what you shared, even if nothing has happened yet.", href: "https://cybercrime.gov.in", action: "Open the portal" },
  ],
  password: [
    { when: "Right now", title: "Change that password", body: "Start with your college mail, then anywhere you reused it. Do it from a device you trust." },
    { when: "Right now", title: "Turn on 2-step verification", body: "A stolen password alone then can't open the account." },
    { when: "Within the hour", title: "Sign out everywhere else", body: "Check your Google account's device list and remove anything you don't recognise.", href: "https://myaccount.google.com/device-activity", action: "Open your devices" },
  ],
  file: [
    { when: "Right now", title: "Go offline", body: "Turn off Wi-Fi and mobile data on that device, so it can't send anything out." },
    { when: "Right now", title: "Remove it", body: "Uninstall the app, delete the file, and run a full security scan." },
    { when: "Within the hour", title: "Change passwords from another device", body: "Assume anything typed on that device has been seen. Start with your mail and bank." },
  ],
  link: [
    { when: "Right now", title: "Close the page", body: "If you typed nothing and downloaded nothing, you're very likely fine. Don't go back to it." },
  ],
};

const ALWAYS: RescueStep[] = [
  { when: "Today", title: "Keep the evidence", body: "Don't delete the mail or chats. Save screenshots of payments and messages." },
  { when: "Today", title: "Don't pay to get it back", body: "Anyone offering to recover your money for a fee is usually the same scam, second round." },
  { when: "Today", title: "Tell your placement cell", body: "You aren't the first and won't be the last. Your report warns everyone else on campus." },
];

const ORDER = ["Right now", "Within the hour", "Today"] as const;

export function rescuePlan(slips: Slip[]): RescueStep[] {
  if (!slips.length) return [];
  const steps = [...SLIPS.map(([s]) => s).filter((s) => slips.includes(s)).flatMap((s) => STEPS[s]), ...ALWAYS];
  const unique = [...new Map(steps.map((s) => [s.title, s])).values()];
  return ORDER.flatMap((when) => unique.filter((s) => s.when === when));
}

export type Incident = { sender?: string; attack?: string; amount?: string; reference?: string; when?: Date };

// Plain text a student can paste into the cybercrime portal. Holds only what they gave us.
export function complaint(slips: Slip[], incident: Incident): string {
  const said = SLIPS.filter(([s]) => slips.includes(s)).map(([, text]) => text.replace(/^I /, "").replace(/^only /, ""));
  const lines = [
    "I am a student and I received a fraudulent mail posing as a job or internship offer.",
    incident.attack ? `Type of fraud: ${incident.attack}.` : "",
    incident.sender ? `Sender's address: ${incident.sender}.` : "",
    said.length ? `What happened: I ${said.join(", and ")}.` : "",
    incident.amount?.trim() ? `Amount lost: ${incident.amount.trim()}.` : "",
    incident.reference?.trim() ? `Transaction or reference ID: ${incident.reference.trim()}.` : "",
    `Reported on: ${(incident.when ?? new Date()).toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Kolkata" })} IST.`,
    "I have kept the original mail and screenshots as evidence. Please help me block the funds and take action against this sender.",
  ];
  return lines.filter(Boolean).join("\n");
}
