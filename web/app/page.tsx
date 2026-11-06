"use client";

import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from "react";
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

const EXTENSION_POINTS = [
  ["Checks mail as you open it", "No pasting. Open any mail in Gmail and the check runs by itself."],
  ["Quiet until it matters", "Normal mails get a small tick and a report you can open. You only see a warning when something is wrong."],
  ["Stops the risky click", "Links in a fake mail ask you to confirm before they open."],
  ["Catches what you're about to send", "Warns you if you type an OTP, Aadhaar, PAN or card number into a reply."],
  ["Sees real sender checks", "Reads the same SPF, DKIM and DMARC results Gmail recorded for the mail."],
  ["Marks risky mail in your inbox", "A dot appears beside suspicious placement mails before you open them."],
  ["Protects the whole campus", "Report a sender, and once the placement cell marks it fake, every student is warned."],
];

const INSTALL_STEPS = [
  "Download the zip and unzip it.",
  "Open chrome://extensions, or brave://extensions in Brave, and turn on Developer mode.",
  "Click Load unpacked and choose the unzipped folder.",
  "Open Gmail and refresh the page.",
];

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
      <header className="border-b border-rule">
        <nav aria-label="Main" className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 sm:px-8">
          <span className="font-display text-xl font-extrabold">PlacementShield</span>
          <span className="flex gap-5">
            <a href="#check" className="text-pad underline underline-offset-4">
              Check a mail
            </a>
            <a href="#extension" className="text-pad underline underline-offset-4">
              Get the extension
            </a>
          </span>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 sm:px-8">
        <section className="grid items-center gap-10 py-10 sm:py-14 lg:grid-cols-[1fr_25rem]">
          <div>
            <h1 className="max-w-3xl font-display text-4xl font-bold leading-tight sm:text-5xl">Catch fake placement mails before you reply, pay or click.</h1>
            <p className="mt-4 max-w-2xl text-lg text-muted">
              PlacementShield checks who really sent a mail, where its links go and what it wants from you, then tells you what to do in five seconds.
            </p>
            <a href="#extension" className="mt-6 inline-block bg-pad px-6 py-3 font-bold text-white hover:bg-ink">
              Add it to Gmail
            </a>
            <p className="mt-3 text-muted">Free. No Google sign-in. We don&apos;t save your mail.</p>
          </div>
          <figure aria-label="Example of the warning shown inside Gmail">
            <div className="border-l-4 border-high bg-[#fbeaec] p-4">
              <p className="font-bold text-high">
                Likely fake <span className="ml-2 font-normal text-muted">Advance-fee scam</span>
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>It asks you to pay money. Real companies don&apos;t charge you to get hired.</li>
                <li>It claims to be Microsoft but was sent from a personal gmail.com address.</li>
              </ul>
              <p className="mt-3 font-bold">Do not pay anything. Check with the placement cell.</p>
              <p className="mt-3 text-muted">Security report: 5 passed, 2 failed</p>
            </div>
            <figcaption className="mt-2 text-muted">An example of what appears on a risky mail in Gmail.</figcaption>
          </figure>
        </section>

        <section id="check" className="scroll-mt-4 border-t border-rule py-10">
          <h2 className="font-display text-2xl font-bold">Check a mail now</h2>
          <div className="mt-6 grid items-start gap-8 lg:grid-cols-[1fr_24rem]">
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
                className="mt-2 block w-full border border-rule bg-sheet px-4 py-2 text-base"
              />

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                <button type="submit" disabled={checking} className="bg-pad px-6 py-3 font-bold text-white hover:bg-ink disabled:opacity-60">
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
                <p className="hidden text-muted lg:block">Your result shows here. We don&apos;t save your mail, but its text goes to Google&apos;s AI to be read, so remove anything private first.</p>
              )}
              {result && <Verdict result={result} />}
            </section>
          </div>
        </section>

        <section id="extension" className="scroll-mt-4 border-t border-rule py-10">
          <h2 className="font-display text-2xl font-bold">Stop copying and pasting</h2>
          <p className="mt-2 max-w-2xl text-lg text-muted">The extension works inside Gmail on Chrome, Brave and Edge. There&apos;s no account or Google sign-in.</p>
          <dl className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {EXTENSION_POINTS.map(([title, body]) => (
              <div key={title}>
                <dt className="font-bold">{title}</dt>
                <dd className="text-muted">{body}</dd>
              </div>
            ))}
          </dl>

          <a href="/placementshield-extension.zip" download className="mt-8 inline-block bg-pad px-6 py-3 font-bold text-white hover:bg-ink">
            Download the extension
          </a>
          <ol className="mt-6 max-w-2xl list-decimal space-y-1 pl-5">
            {INSTALL_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="mt-4 max-w-2xl text-muted">
            A switch in the extension turns it off at any time. While it&apos;s on, every mail you open is checked and its text goes to Google&apos;s AI. Mail you don&apos;t open never leaves your browser, and we don&apos;t save anything you check.
          </p>
        </section>
      </main>
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
      <p className={`stamp inline-block border-4 px-4 py-2 font-display text-3xl font-extrabold ${color}`}>{stamp}</p>
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
