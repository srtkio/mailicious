"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { CheckResult, Level, SecurityCheck } from "@/lib/types";

const VERDICT: Record<Level, { stamp: string; color: string }> = {
  high: { stamp: "Likely fake", color: "text-high border-high" },
  medium: { stamp: "Check first", color: "text-medium border-medium" },
  low: { stamp: "No red flags", color: "text-low border-low" },
};

const MARK: Record<SecurityCheck["status"], { sign: string; color: string; said: string }> = {
  pass: { sign: "✓", color: "text-low", said: "Passed" },
  warn: { sign: "!", color: "text-medium", said: "Warning" },
  fail: { sign: "✕", color: "text-high", said: "Failed" },
  skip: { sign: "–", color: "text-muted", said: "Not checked" },
};

// "7 passed, 1 to check": the report at a glance, before anyone opens it.
function reportSummary(checks: SecurityCheck[]): string {
  const n = (status: SecurityCheck["status"]) => checks.filter((c) => c.status === status).length;
  return [`${n("pass")} passed`, n("warn") && `${n("warn")} to check`, n("fail") && `${n("fail")} failed`, n("skip") && `${n("skip")} not checked`].filter(Boolean).join(", ");
}

const RAW_MAIL = /^(Delivered-To|Received|Return-Path|Authentication-Results|MIME-Version|ARC-Seal|X-[\w-]+):/i;

// Fictional mails for trying the checker. None has a real link, so a demo click fetches nothing.
const SAMPLES = [
  {
    label: "Try a fake offer",
    sender: "hr.microsoft.india@gmail.com",
    text: "Congratulations! You have been selected for the Microsoft summer internship. No interview is needed.\n\nPay the refundable registration fee of Rs 1500 and share the OTP sent to your phone within 2 hours to confirm your seat.",
  },
  {
    label: "Try a spoofed sender",
    sender: "",
    text: `Delivered-To: student@rishihood.edu.in
Authentication-Results: mx.google.com;
       spf=fail smtp.mailfrom=hr@microsoft.com;
       dkim=none;
       dmarc=fail header.from=microsoft.com
From: Microsoft Careers <hr@microsoft.com>
Reply-To: <collect.offers@gmail.com>
Subject: Your internship offer
Content-Type: text/plain

Your Microsoft internship offer is ready. Reply with your details to accept it.`,
  },
  {
    label: "Try a normal invite",
    sender: "careers@infosys.com",
    text: "Your Infosys interview is on Monday at 10am. Stipend: pay of ₹20,000 per month.\n\nApply for your slot on the careers portal. Never share your OTP or password with anyone.",
  },
];

const ICONS = {
  shield: ["M12 3l8 3v6c0 4.5-3.2 8.2-8 9-4.8-.8-8-4.5-8-9V6l8-3z", "M9 12l2 2 4-4"],
  mail: ["M4 6h16v12H4z", "M4 7l8 6 8-6"],
  link: ["M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1", "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"],
  lock: ["M6 11h12v9H6z", "M8 11V8a4 4 0 0 1 8 0v3"],
  building: ["M5 21V4h9v17", "M14 9h5v12", "M8 8h3", "M8 12h3", "M8 16h3", "M4 21h16"],
  clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7v5l3 2"],
  clip: ["M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.5a1.7 1.7 0 0 1-2.4-2.4L15 7"],
  users: ["M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20", "M10 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7", "M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3", "M15.5 5.2a3.5 3.5 0 0 1 0 6.6"],
  download: ["M12 4v11", "M7 11l5 5 5-5", "M5 20h14"],
  check: ["M5 12.5l4.5 4.5L19 7"],
  cursor: ["M5 4l14 6-6 2-2 6z"],
} as const;

function Icon({ name, className = "h-6 w-6" }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {ICONS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

const STEPS = [
  ["mail", "Open any mail", "Placement offers, college notices, bills, anything. The extension checks it the moment you open it."],
  ["shield", "We check the proof", "Who really sent it, where the links go, what it asks for, and whether the offer adds up."],
  ["check", "You get one answer", "A tick when it's fine. A short warning with one clear next step when it isn't."],
] as const;

const CHECKS = [
  ["lock", "Real sender proof", "Reads the SPF, DKIM and DMARC results Gmail recorded, so a forged From address can't pass."],
  ["link", "Where links really go", "Catches disguised links, look-alike addresses and short links that hide the destination."],
  ["clip", "Dangerous attachments", "Spots programs, archives and web pages posing as offer letters."],
  ["cursor", "What it asks of you", "Flags requests for money, OTPs, passwords, ID and bank details, in plain English or Hinglish."],
  ["building", "The company is real", "Looks the company up online and compares the sender with its official website."],
  ["clock", "How new the domain is", "A sender domain registered last week isn't a recruiter, however good the mail looks."],
] as const;

const INSTALL = [
  ["Download and unzip", "Save the file below, then double-click it to unzip."],
  ["Open your extensions page", "Type brave://extensions or chrome://extensions in the address bar, and turn on Developer mode."],
  ["Click Load unpacked", "Choose the unzipped folder. PlacementShield appears in your toolbar."],
  ["Open Gmail", "Refresh the page, then open any mail. The card shows up on its own."],
] as const;

function Mark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={className}>
      <path d="M16 2l12 4.5v8.2c0 7.1-4.9 11.6-12 15.3C8.9 26.3 4 21.8 4 14.7V6.5L16 2z" fill="#2a2f8f" />
      <path d="M10.5 15.5l4 4 7-8" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GmailMock() {
  return (
    <figure aria-label="Example of PlacementShield inside Gmail" className="relative">
      <span className="stamp absolute -right-2 -top-5 z-10 border-4 border-high bg-white px-3 py-1 font-display text-2xl font-extrabold text-high shadow-lg">Likely fake</span>
      <div className="overflow-hidden rounded-lg bg-white text-ink shadow-2xl ring-1 ring-black/10">
        <div className="flex items-center gap-1.5 border-b border-rule bg-[#eef2ee] px-4 py-2.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-[#e7776b]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#e8c05a]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#6cc08b]" />
          <span className="ml-3 text-xs text-muted">mail.google.com</span>
        </div>
        <div className="p-5">
          <p className="font-display text-xl font-bold">Congratulations! You are selected</p>
          <p className="mt-1 text-sm text-muted">Microsoft HR &lt;hr.microsoft.india@gmail.com&gt;</p>
          <div className="mt-4 border-l-4 border-high bg-[#fbeaec] p-4 text-sm">
            <p>
              <span className="text-base font-extrabold text-high">Likely fake</span> <span className="ml-1 text-muted">Advance-fee scam</span>
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>It asks you to pay money. Real companies don&apos;t charge you to get hired.</li>
              <li>It claims to be Microsoft but was sent from a personal gmail.com address.</li>
            </ul>
            <p className="mt-3 font-bold">Do not pay anything. Check with the placement cell.</p>
            <p className="mt-2 text-muted">Security report: 5 passed, 3 failed</p>
          </div>
          <div className="mt-4 space-y-2" aria-hidden>
            <div className="h-2.5 w-11/12 rounded bg-[#e4e9e4]" />
            <div className="h-2.5 w-4/5 rounded bg-[#e4e9e4]" />
            <div className="h-2.5 w-3/5 rounded bg-[#e4e9e4]" />
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-sm text-mint/80">An example of what you&apos;d see on a fake offer, inside Gmail.</figcaption>
    </figure>
  );
}

export default function Home() {
  const [text, setText] = useState("");
  const [sender, setSender] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  function edit(nextText: string, nextSender: string) {
    setText(nextText);
    setSender(nextSender);
    setResult(null); // an old verdict must never sit beside a changed mail
    setError("");
  }

  async function check(e: FormEvent) {
    e.preventDefault();
    setChecking(true);
    setResult(null);
    setError("");
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(RAW_MAIL.test(text.trimStart()) ? { raw: text.trimStart(), sender } : { text, sender }),
      });
      const data = await res.json();
      if (res.ok) setResult(data);
      else setError(data.error ?? "The check failed. Try again.");
    } catch {
      setError("Couldn't reach the checker. Check your connection and try again.");
    } finally {
      setChecking(false);
    }
  }

  async function openFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) edit(await file.text(), "");
  }

  return (
    <>
      <div className="bg-night text-white">
        <nav aria-label="Main" className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-5 sm:px-8">
          <span className="flex items-center gap-2 font-display text-xl font-extrabold">
            <Mark /> PlacementShield
          </span>
          <span className="flex flex-wrap gap-x-6 gap-y-1">
            <a href="#how" className="text-mint underline-offset-4 hover:underline">
              How it works
            </a>
            <a href="#check" className="text-mint underline-offset-4 hover:underline">
              Check a mail
            </a>
            <a href="#extension" className="text-mint underline-offset-4 hover:underline">
              Get the extension
            </a>
          </span>
        </nav>

        <section className="mx-auto grid w-full max-w-6xl items-center gap-14 px-4 pb-20 pt-10 sm:px-8 sm:pt-14 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="font-bold text-mint">For every student who gets placement mail</p>
            <h1 className="mt-3 font-display text-4xl font-extrabold leading-[1.05] sm:text-6xl">Catch the fake offer before you reply, pay or click.</h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-mint/90">
              PlacementShield sits inside Gmail. It checks who really sent a mail, where its links go and what it wants from you, then tells you what to do in five seconds.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <a href="#extension" className="bg-white px-6 py-3 font-bold text-night hover:bg-mint">
                Add it to Gmail
              </a>
              <a href="#check" className="border border-white/40 px-6 py-3 font-bold text-white hover:bg-white/10">
                Try the checker
              </a>
            </div>
            <p className="mt-4 text-mint/80">Free. No Google sign-in. We don&apos;t save your mail.</p>
          </div>
          <GmailMock />
        </section>
      </div>

      <main>
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-8">
          <h2 className="max-w-3xl font-display text-3xl font-bold leading-tight sm:text-4xl">Most scam mails look exactly like real offers. Warnings that cry wolf get ignored.</h2>
          <p className="mt-4 max-w-3xl text-lg text-muted">
            So PlacementShield stays quiet on normal mail and speaks up only when it has proof: a failed sender check, a disguised link, a request for money or a code. Every warning comes with its evidence and one next step.
          </p>
        </section>

        <section id="how" className="mx-auto w-full max-w-6xl scroll-mt-4 px-4 pb-16 sm:px-8">
          <h2 className="font-display text-3xl font-bold">How it works</h2>
          <ol className="mt-8 grid gap-10 md:grid-cols-3">
            {STEPS.map(([icon, title, body], i) => (
              <li key={title} className="relative">
                <span className="flex items-center gap-4">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-night text-mint">
                    <Icon name={icon} className="h-7 w-7" />
                  </span>
                  <span className="font-display text-5xl font-extrabold text-rule" aria-hidden>
                    {i + 1}
                  </span>
                </span>
                <h3 className="mt-4 font-display text-xl font-bold">{title}</h3>
                <p className="mt-2 text-muted">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-sheet">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-8">
            <h2 className="font-display text-3xl font-bold">What it checks</h2>
            <p className="mt-2 max-w-2xl text-muted">Six things a worried student can&apos;t easily check alone, done in a few seconds.</p>
            <ul className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
              {CHECKS.map(([icon, title, body]) => (
                <li key={title} className="border-t-2 border-night pt-5">
                  <Icon name={icon} className="h-7 w-7 text-pad" />
                  <h3 className="mt-3 font-display text-lg font-bold">{title}</h3>
                  <p className="mt-1 text-muted">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-8">
          <h2 className="font-display text-3xl font-bold">Three answers, so you always know where you stand</h2>
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <div>
              <p className="text-low">
                <span className="font-bold">✓ PlacementShield:</span> Verified college office. It passed the sender checks.
              </p>
              <h3 className="mt-4 font-display text-lg font-bold">Most mails: one quiet line</h3>
              <p className="text-muted">Nothing to read, nothing to dismiss. Open the report if you&apos;re curious.</p>
            </div>
            <div>
              <div className="border-l-4 border-medium bg-[#fbf2e3] p-4 text-sm">
                <p className="text-base font-extrabold text-medium">Check first</p>
                <p className="mt-1">It claims to be Zoho, but zoho-careers-india.example isn&apos;t Zoho&apos;s website.</p>
              </div>
              <h3 className="mt-4 font-display text-lg font-bold">Something doesn&apos;t add up</h3>
              <p className="text-muted">You get the reason and what to verify, never a vague scare.</p>
            </div>
            <div>
              <div className="border-l-4 border-high bg-[#fbeaec] p-4 text-sm">
                <p className="text-base font-extrabold text-high">Likely fake</p>
                <p className="mt-1">It asks you to share an OTP. No real recruiter ever needs this.</p>
              </div>
              <h3 className="mt-4 font-display text-lg font-bold">Proof of a scam</h3>
              <p className="text-muted">Links pause before they open, and replies are watched for OTPs and ID numbers.</p>
            </div>
          </div>
        </section>

        <section id="check" className="mx-auto w-full max-w-6xl scroll-mt-4 px-4 pb-16 sm:px-8">
          <h2 className="font-display text-3xl font-bold">Try it on a mail right now</h2>
          <p className="mt-2 text-muted">No install needed. Paste a mail, or use one of the samples.</p>
          <div className="mt-6 grid items-start gap-8 border border-rule bg-sheet p-5 sm:p-8 lg:grid-cols-[1fr_24rem]">
            <form onSubmit={check}>
              <label htmlFor="mail" className="font-bold">
                The mail
              </label>
              <p id="mail-hint" className="mt-1 text-muted">
                Paste the text. For the full sender checks, paste Gmail&apos;s Show original, or open a saved .eml file.
              </p>
              <textarea
                id="mail"
                required
                aria-describedby="mail-hint"
                maxLength={1000000}
                rows={10}
                value={text}
                onChange={(e) => edit(e.target.value, sender)}
                className="ledger mt-2 block w-full resize-y border border-rule px-4 text-base"
              />
              <label htmlFor="file" className="mt-4 block font-bold">
                Or open a mail file
              </label>
              <input id="file" type="file" accept=".eml,.txt,message/rfc822" onChange={openFile} className="mt-2 block w-full text-muted" />

              <label htmlFor="sender" className="mt-5 block font-bold">
                Sender&apos;s address, if you have it
              </label>
              <input
                id="sender"
                type="text"
                inputMode="email"
                autoComplete="off"
                maxLength={320}
                value={sender}
                onChange={(e) => edit(text, e.target.value)}
                className="mt-2 block w-full border border-rule bg-white px-4 py-2 text-base"
              />

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                <button type="submit" disabled={checking} className="bg-pad px-6 py-3 font-bold text-white hover:bg-night disabled:opacity-60">
                  {checking ? "Checking…" : "Check this mail"}
                </button>
                {SAMPLES.map((s) => (
                  <button key={s.label} type="button" onClick={() => edit(s.text, s.sender)} className="text-pad underline underline-offset-4 hover:text-ink">
                    {s.label}
                  </button>
                ))}
              </div>
            </form>

            <section aria-live="polite" aria-label="Result">
              {error && <p className="font-bold text-high">{error}</p>}
              {!result && !error && (
                <p className="text-muted">Your result shows here. We don&apos;t save your mail, but its text goes to Google&apos;s AI to be read, so remove anything private first.</p>
              )}
              {result && <Verdict result={result} />}
            </section>
          </div>
        </section>

        <section id="extension" className="scroll-mt-4 bg-night text-white">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-20 sm:px-8 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <p className="font-bold text-mint">The Gmail extension</p>
              <h2 className="mt-2 font-display text-4xl font-extrabold leading-tight">Stop copying and pasting. Let it watch your inbox.</h2>
              <p className="mt-4 text-lg leading-8 text-mint/90">Works inside Gmail on Chrome, Brave and Edge. No account, no Google sign-in.</p>

              <div className="mt-8 rounded-lg bg-white p-6 text-ink shadow-2xl">
                <div className="flex items-center gap-4">
                  <Mark className="h-14 w-14" />
                  <div>
                    <p className="font-display text-xl font-bold">PlacementShield for Gmail</p>
                    <p className="text-muted">Version 1.0.0, under 20 KB</p>
                  </div>
                </div>
                <a href="/placementshield-extension.zip" download className="mt-5 flex items-center justify-center gap-2 bg-pad px-6 py-4 text-lg font-bold text-white hover:bg-night">
                  <Icon name="download" className="h-5 w-5" /> Download the extension
                </a>
                <p className="mt-3 text-sm text-muted">Chrome, Brave and Edge. It takes about a minute to set up.</p>
              </div>

              <ul className="mt-8 space-y-3 text-mint/90">
                <li className="flex gap-3">
                  <Icon name="check" className="mt-1 h-5 w-5 shrink-0 text-mint" />
                  <span>Only the mail you open is checked. Mail you never open never leaves your browser.</span>
                </li>
                <li className="flex gap-3">
                  <Icon name="check" className="mt-1 h-5 w-5 shrink-0 text-mint" />
                  <span>Long numbers, passwords and codes are hidden before the text reaches Google&apos;s AI.</span>
                </li>
                <li className="flex gap-3">
                  <Icon name="check" className="mt-1 h-5 w-5 shrink-0 text-mint" />
                  <span>One switch in the toolbar turns it off any time.</span>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-display text-2xl font-bold">Set up in four steps</h3>
              <ol className="mt-6 space-y-5">
                {INSTALL.map(([title, body], i) => (
                  <li key={title} className="flex gap-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-mint font-display text-lg font-extrabold text-night">{i + 1}</span>
                    <span>
                      <span className="block text-lg font-bold">{title}</span>
                      <span className="block text-mint/85">{body}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-8 border-l-4 border-mint/50 pl-4 text-mint/85">
                Why not the Chrome Web Store? Store review takes days, and Chrome only installs from the store or through managed policy. This is the same code, loaded directly. A store listing is the next step.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-16 sm:px-8 md:grid-cols-[auto_1fr_auto]">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-night text-mint">
            <Icon name="users" className="h-8 w-8" />
          </span>
          <div>
            <h2 className="font-display text-2xl font-bold">One report protects the whole campus</h2>
            <p className="mt-1 max-w-2xl text-muted">
              A student reports a suspicious sender. The placement cell marks it fake, and everyone sees the same warning within a minute. Personal accounts are judged one address at a time, so a shared domain like gmail.com is never blocked.
            </p>
          </div>
          <Link href="/dashboard" className="border border-night px-5 py-3 text-center font-bold text-night hover:bg-night hover:text-white">
            Placement cell dashboard
          </Link>
        </section>
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-muted sm:px-8">
          <span className="flex items-center gap-2">
            <Mark className="h-6 w-6" /> PlacementShield, built for Arthakram PS5
          </span>
          <span>Nothing you check is saved. Text of checked mail goes to Google&apos;s AI.</span>
        </div>
      </footer>
    </>
  );
}

function Report({ result }: { result: CheckResult }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function send() {
    setState("sending");
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sender: result.sender, level: result.level, attack: result.attack }),
    }).catch(() => null);
    setState(res?.ok ? "sent" : "failed");
  }

  if (state === "sent") return <p className="mt-5 text-low">Reported to your placement cell.</p>;
  return (
    <p className="mt-5">
      <button type="button" disabled={state === "sending"} onClick={send} className="border border-pad px-4 py-2 font-bold text-pad disabled:opacity-60">
        {state === "sending" ? "Reporting…" : "Report this sender"}
      </button>
      {state === "failed" && <span className="ml-3 text-high">Reporting failed. Try again.</span>}
    </p>
  );
}

function Verdict({ result }: { result: CheckResult }) {
  const { stamp, color } = VERDICT[result.level];
  const evidence = [result.evidence.company].filter((e): e is string => !!e);
  const more = result.flags.map((f) => f.text).filter((t) => !result.reasons.includes(t));
  const top = useRef<HTMLDivElement>(null);
  // On a phone the verdict lands below the fold. Braces matter: scrollIntoView's return value must not reach React as a cleanup.
  useEffect(() => {
    top.current?.scrollIntoView({ block: "nearest" });
  }, []);

  return (
    <div ref={top} className="pt-3">
      <p className={`stamp inline-block border-4 bg-white px-4 py-2 font-display text-3xl font-extrabold ${color}`}>{stamp}</p>
      {result.attack && <p className="mt-4 font-bold">Attack type: {result.attack}</p>}

      <ul className="mt-4 space-y-2">
        {result.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      <p className="mt-5 font-bold">{result.nextStep}</p>

      <h3 className="mt-6 border-t border-rule pt-4 font-display text-lg font-bold">Security report</h3>
      <p className="text-muted">{reportSummary(result.checks)}</p>
      <ul className="mt-2 space-y-2">
        {result.checks.map((c) => (
          <li key={c.label} className="grid grid-cols-[1.25rem_1fr] gap-1">
            <span aria-hidden className={`font-bold ${MARK[c.status].color}`}>
              {MARK[c.status].sign}
            </span>
            <span>
              <span className="font-bold">{c.label}</span>
              <span className="sr-only"> ({MARK[c.status].said})</span>: <span className="text-muted">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      {result.level !== "low" && result.sender && <Report result={result} />}

      <details className="mt-5 border-t border-rule pt-3">
        <summary className="cursor-pointer text-pad underline underline-offset-4">Why?</summary>
        <div className="mt-3 space-y-2 text-muted">
          {evidence.map((e) => (
            <p key={e}>{e}</p>
          ))}
          {more.map((t) => (
            <p key={t}>{t}</p>
          ))}
          {result.sources.map((s) => (
            <p key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-pad underline underline-offset-4">
                {s.title}
              </a>
            </p>
          ))}
          {result.mode === "limited" && <p>This was a quick check of the text, sender and links. It couldn&apos;t look the company up online this time.</p>}
        </div>
      </details>
    </div>
  );
}
