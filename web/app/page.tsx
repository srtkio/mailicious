"use client";

import Link from "next/link";
import { ScamDrill } from "./drill";
import { CampusFlow, InstallFlow, PipelineFlow } from "./flows";
import { HeroFade, HeroStage } from "./hero";
import { Intro, Marquee, Silk, Stagger } from "./motion";
import { Logo, Nav, Reveal } from "./nav";
import { CampusRadar } from "./radar";
import { Guide, HeroScene } from "./scene";
import { DnaLab, LetterLab, Rescue } from "./standouts";
import { ScrollXray } from "./xray";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent } from "react";
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

const CHECKS = [
  ["lock", "Real sender proof", "Reads the SPF, DKIM and DMARC results Gmail recorded, so a forged From address can't pass."],
  ["link", "Where links really go", "Catches disguised links, look-alike addresses and short links that hide the destination."],
  ["clip", "Dangerous attachments", "Spots programs, archives and web pages posing as offer letters."],
  ["cursor", "What it asks of you", "Flags requests for money, OTPs, passwords, ID and bank details, in plain English or Hinglish."],
  ["building", "The company is real", "Looks the company up online and compares the sender with its official website."],
  ["clock", "How new the domain is", "A sender domain registered last week isn't a recruiter, however good the mail looks."],
] as const;

const SCAMS = ["Advance-fee scam", "OTP relay", "Hacked college ID", "Look-alike link", "Disguised link", "Fake offer letter", "Money mule"] as const;

const WHILE_CHECKING = ["Sender proof", "Where links go", "Attachments", "What it asks", "The company", "Domain age"];

// What a worried student sees instead of a spinner: the checks actually being made.
function Checking() {
  return (
    <div role="status" className="relative overflow-hidden rounded-md border border-rule bg-white p-5">
      <span aria-hidden className="paper-scan xray-beam absolute inset-x-0 h-8" />
      <p className="font-display text-xl font-bold">Checking this mail…</p>
      <ul className="mt-3 space-y-1.5">
        {WHILE_CHECKING.map((label, i) => (
          <li key={label} style={{ "--i": i * 3 } as CSSProperties} className="tick-in text-muted">
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

const chapter = "grid items-start gap-8 border-t border-white/15 py-12 lg:grid-cols-[1fr_1.25fr] lg:gap-14";

export default function Home() {
  const [ready, setReady] = useState(false);
  const onIntroDone = useCallback(() => setReady(true), []);
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
      <Intro onDone={onIntroDone} />
      <Nav />
      <div id="top" className="relative overflow-hidden bg-night text-white">
        <Silk />
        <HeroFade className="relative">
          <section className="mx-auto grid w-full max-w-6xl items-center gap-14 px-4 pb-20 pt-10 sm:px-8 sm:pt-14 lg:grid-cols-[1.05fr_1fr]">
            <div>
              <p className="hero-rise font-bold text-flame">For every student who gets placement mail</p>
              <h1 style={{ "--i": 1 } as CSSProperties} className="hero-rise mt-3 font-display text-4xl font-extrabold leading-[1.05] sm:text-6xl">
                Catch the fake offer before you reply, pay or click.
              </h1>
              <p style={{ "--i": 2 } as CSSProperties} className="hero-rise mt-5 max-w-xl text-lg leading-8 text-white/80">
                MAILicious sits inside Gmail. It checks who really sent a mail, where its links go and what it wants from you, then tells you what to do in five seconds.
              </p>
              <div style={{ "--i": 3 } as CSSProperties} className="hero-rise mt-8 flex flex-wrap gap-4">
                <a href="#extension" className="shine bg-flame px-6 py-3 font-bold text-black hover:bg-white">
                  Add it to Gmail
                </a>
                <a href="#check" className="border border-white/50 px-6 py-3 font-bold text-white hover:bg-white hover:text-black">
                  Try the checker
                </a>
              </div>
              <p style={{ "--i": 4 } as CSSProperties} className="hero-rise mt-4 text-white/70">
                Free. No Google sign-in. We don&apos;t save your mail.
              </p>
            </div>
            <HeroStage>
              <HeroScene play={ready} />
            </HeroStage>
          </section>
        </HeroFade>
      </div>
      <Marquee items={SCAMS} />

      <main>
        <section id="guide" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-8">
          <Reveal>
            <h2 className="font-display text-3xl font-bold sm:text-4xl">Your first minute with MAILicious</h2>
            <p className="mt-2 max-w-2xl text-muted">Four steps from install to your first warning. Click through them.</p>
            <Guide />
          </Reveal>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-8">
          <h2 className="max-w-3xl font-display text-3xl font-bold leading-tight sm:text-4xl">Most scam mails look exactly like real offers. Warnings that cry wolf get ignored.</h2>
          <p className="mt-4 max-w-3xl text-lg text-muted">
            So MAILicious stays quiet on normal mail and speaks up only when it has proof: a failed sender check, a disguised link, a request for money or a code. Every warning comes with its evidence and one next step.
          </p>
        </section>

        <ScrollXray />

        <section id="how" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-8">
          <h2 className="font-display text-3xl font-bold">How it works</h2>
          <p className="mt-2 max-w-2xl text-muted">Every mail you open runs through the same six checks at once, and comes out as one clear answer.</p>
          <div className="mt-8 rounded-lg border border-rule bg-sheet p-3 sm:p-6">
            <PipelineFlow />
          </div>
        </section>

        <section className="bg-sheet">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-8">
            <h2 className="font-display text-3xl font-bold">What it checks</h2>
            <p className="mt-2 max-w-2xl text-muted">Six things a worried student can&apos;t easily check alone, done in a few seconds.</p>
            <ul className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
              {CHECKS.map(([icon, title, body], i) => (
                <li key={title}>
                  <Stagger index={i} className="lift h-full border-t-2 border-night pt-5">
                    <Icon name={icon} className="h-7 w-7 text-pad" />
                    <h3 className="mt-3 font-display text-lg font-bold">{title}</h3>
                    <p className="mt-1 text-muted">{body}</p>
                  </Stagger>
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
                <span className="font-bold">✓ MAILicious:</span> Verified college office. It passed the sender checks.
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

        <section id="drill" className="bg-night text-white">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-8 lg:grid-cols-[1fr_1.15fr]">
            <div>
              <p className="font-bold text-flame">Scam Drill</p>
              <h2 className="mt-2 font-display text-4xl font-extrabold leading-tight">Can you spot the fake?</h2>
              <p className="mt-4 text-lg leading-8 text-white/80">Five fictional mails, real or fake. Each answer shows the exact tell, so you build the instinct as well as having the tool.</p>
            </div>
            <ScamDrill />
          </div>
        </section>

        <section id="radar" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-8">
          <Reveal>
            <p className="font-bold text-pad">Live Campus Radar</p>
            <h2 className="mt-1 font-display text-3xl font-bold">What MAILicious is seeing right now</h2>
            <p className="mt-2 max-w-2xl text-muted">Real totals from real checks, updated live. Only counts and attack types are kept, never a sender or a word of any mail.</p>
            <CampusRadar />
          </Reveal>
        </section>

        <section id="standouts" aria-labelledby="standouts-title" className="relative scroll-mt-14 overflow-hidden bg-night text-white">
          <Silk sheet={{ from: [1.08, 0.02], a: [0.5, 0.2], b: [0.9, 0.62], to: [-0.1, 0.34], alpha: 0.13, width: 0.14 }} />
          <div className="relative mx-auto w-full max-w-6xl px-4 pb-8 pt-20 sm:px-8">
            <Reveal>
              <p className="font-bold text-flame">Stand-outs</p>
              <h2 id="standouts-title" className="mt-2 max-w-3xl text-balance font-display text-4xl font-extrabold leading-tight sm:text-5xl">
                Three things a spam filter can&apos;t do.
              </h2>
            </Reveal>

            <div className={`${chapter} mt-10`}>
              <Reveal>
                <h3 className="font-display text-3xl font-bold">Scam DNA</h3>
                <p className="mt-1 font-bold text-flame">Block the script, not the sender.</p>
                <p className="mt-3 text-lg leading-8 text-white/80">A new Gmail costs a scammer a minute, so a blocklist alone loses. MAILicious fingerprints the script itself. Once your placement cell marks one scam fake, its rewrites are caught too, whoever sends them.</p>
                <p className="mt-3 text-white/70">Only a 64-bit fingerprint is stored, and the mail can&apos;t be rebuilt from it. Press the buttons: this is the real algorithm.</p>
              </Reveal>
              <Reveal>
                <DnaLab />
              </Reveal>
            </div>

            <div id="letter" className={`${chapter} scroll-mt-14`}>
              <Reveal>
                <h3 className="font-display text-3xl font-bold">Offer Letter X-ray</h3>
                <p className="mt-1 font-bold text-flame">The PDF is the bait. So open it up.</p>
                <p className="mt-3 text-lg leading-8 text-white/80">It tests the GST number&apos;s check digit, reads the structure of the CIN, finds which tool really made the file, compares dates, and looks for UPI IDs, payment demands and hidden scripts.</p>
                <p className="mt-3 text-white/70">It runs entirely in your browser, so your letter is never uploaded.</p>
              </Reveal>
              <Reveal>
                <LetterLab />
              </Reveal>
            </div>

            <div id="rescue" className={`${chapter} scroll-mt-14`}>
              <Reveal>
                <h3 className="font-display text-3xl font-bold">Damage Control</h3>
                <p className="mt-1 font-bold text-flame">Most tools stop at the warning.</p>
                <p className="mt-3 text-lg leading-8 text-white/80">Already paid or shared a code? Say what happened and get an ordered rescue plan, starting with India&apos;s 1930 cybercrime helpline, plus a complaint that&apos;s already written.</p>
                <p className="mt-3 text-white/70">It appears only when you ask for it, so it adds no alarms.</p>
              </Reveal>
              <Reveal>
                <Rescue />
              </Reveal>
            </div>
          </div>
        </section>

        <section id="check" className="mx-auto w-full max-w-6xl scroll-mt-14 px-4 py-16 sm:px-8">
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
                <button type="submit" disabled={checking} className="shine bg-flame px-6 py-3 font-bold text-black hover:bg-black hover:text-white disabled:opacity-60">
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
              {checking && <Checking />}
              {!result && !error && !checking && (
                <p className="text-muted">Your result shows here. We don&apos;t save your mail, but its text goes to Google&apos;s AI to be read, so remove anything private first.</p>
              )}
              {result && <Verdict result={result} />}
            </section>
          </div>
        </section>

        <section id="extension" className="bg-night text-white">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-20 sm:px-8 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <p className="font-bold text-flame">The Gmail extension</p>
              <h2 className="mt-2 font-display text-4xl font-extrabold leading-tight">Stop copying and pasting. Let it watch your inbox.</h2>
              <p className="mt-4 text-lg leading-8 text-white/80">Works inside Gmail on Chrome, Brave and Edge. No account, no Google sign-in.</p>

              <div className="mt-8 rounded-lg bg-white p-6 text-ink shadow-2xl">
                <div className="flex items-center gap-4">
                  <Logo className="h-14 w-14" />
                  <div>
                    <p className="font-display text-xl font-bold">MAILicious for Gmail</p>
                    <p className="text-muted">Version 1.2.0, under 25 KB</p>
                  </div>
                </div>
                <a href="/mailicious-extension.zip" download className="mt-5 flex items-center justify-center gap-2 bg-flame px-6 py-4 text-lg font-bold text-black hover:bg-black hover:text-white">
                  <Icon name="download" className="h-5 w-5" /> Download the extension
                </a>
                <p className="mt-3 text-sm text-muted">Chrome, Brave and Edge. It takes about a minute to set up.</p>
              </div>

              <ul className="mt-8 space-y-3 text-white/80">
                <li className="flex gap-3">
                  <Icon name="check" className="mt-1 h-5 w-5 shrink-0 text-flame" />
                  <span>Only the mail you open is checked. Mail you never open never leaves your browser.</span>
                </li>
                <li className="flex gap-3">
                  <Icon name="check" className="mt-1 h-5 w-5 shrink-0 text-flame" />
                  <span>Long numbers, passwords and codes are hidden before the text reaches Google&apos;s AI.</span>
                </li>
                <li className="flex gap-3">
                  <Icon name="check" className="mt-1 h-5 w-5 shrink-0 text-flame" />
                  <span>One switch in the toolbar turns it off any time.</span>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-display text-2xl font-bold">Set up in four steps</h3>
              <div className="mt-6">
                <InstallFlow />
              </div>
              <p className="mt-8 border-l-4 border-flame pl-4 text-white/75">
                Why not the Chrome Web Store? Store review takes days, and Chrome only installs from the store or through managed policy. This is the same code, loaded directly. A store listing is the next step.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl font-bold">One report protects the whole campus</h2>
              <p className="mt-2 max-w-2xl text-muted">Personal accounts are judged one address at a time, so a shared domain like gmail.com is never blocked.</p>
            </div>
            <Link href="/dashboard" className="border-2 border-black px-5 py-3 text-center font-bold text-black hover:bg-black hover:text-white">
              Placement cell dashboard
            </Link>
          </div>
          <div className="mt-8 rounded-lg border border-rule bg-sheet p-3 sm:p-6">
            <CampusFlow />
          </div>
        </section>
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-muted sm:px-8">
          <span className="flex items-center gap-2">
            <Logo className="h-6 w-6" /> MAILicious, built for Arthakram PS5
          </span>
          <span>Nothing you check is saved. Text of checked mail goes to Google&apos;s AI.</span>
        </div>
      </footer>
    </>
  );
}

const BAR: Record<SecurityCheck["status"], string> = { pass: "bg-low", warn: "bg-medium", fail: "bg-high", skip: "bg-rule" };

// One bar per run of the report: the whole picture at a glance, with counts beside it so colour never carries it alone.
function ReportBar({ checks }: { checks: SecurityCheck[] }) {
  const order: SecurityCheck["status"][] = ["fail", "warn", "pass", "skip"];
  const parts = order.map((status) => ({ status, count: checks.filter((c) => c.status === status).length })).filter((p) => p.count);
  return (
    <div className="mt-2">
      <div className="flex h-3 gap-0.5" role="img" aria-label={reportSummary(checks)}>
        {parts.map((p) => (
          <span key={p.status} title={`${p.count} ${MARK[p.status].said.toLowerCase()}`} style={{ flexGrow: p.count }} className={`rounded-sm ${BAR[p.status]}`} />
        ))}
      </div>
      <p className="mt-1.5 flex flex-wrap gap-x-3 text-sm text-muted">
        {parts.map((p) => (
          <span key={p.status}>
            <span aria-hidden className={`font-bold ${MARK[p.status].color}`}>
              {MARK[p.status].sign}
            </span>{" "}
            {p.count} {MARK[p.status].said.toLowerCase()}
          </span>
        ))}
      </p>
    </div>
  );
}

function Report({ result }: { result: CheckResult }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function send() {
    setState("sending");
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sender: result.sender, level: result.level, attack: result.attack, dna: result.dna, dnaToken: result.dnaToken }),
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
      <ReportBar checks={result.checks} />
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
