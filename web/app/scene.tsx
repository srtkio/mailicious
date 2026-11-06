"use client";

import { useEffect, useState } from "react";

const CHECKS = [
  ["Sender proof", "Sent from a personal Gmail", "fail"],
  ["Links", "None to check", "skip"],
  ["Attachments", "Nothing dangerous", "pass"],
  ["What it asks", "Money and an OTP", "fail"],
  ["The offer", "No interview at all", "warn"],
] as const;
const SIGN = { pass: ["✓", "text-low"], warn: ["!", "text-medium"], fail: ["✕", "text-high"], skip: ["–", "text-muted"] } as const;

// mail arrives, then scanning, then each check, then the verdict, then the stamp
const SCAN = 1;
const FIRST_CHECK = 2;
const VERDICT = FIRST_CHECK + CHECKS.length;
const STAMP = VERDICT + 1;
const GAPS = [500, 700, ...CHECKS.map(() => 380), 450, 500];

export function HeroScene() {
  const [stage, setStage] = useState(0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const done = setTimeout(() => setStage(STAMP), 0);
      return () => clearTimeout(done);
    }
    let elapsed = 0;
    const timers = GAPS.map((gap, i) => {
      elapsed += gap;
      return setTimeout(() => setStage(i + 1 > STAMP ? STAMP : i), elapsed);
    });
    return () => timers.forEach(clearTimeout);
  }, [run]);

  const scanning = stage >= SCAN && stage < VERDICT;
  return (
    <figure aria-label="Animation: a fake offer arrives, MAILicious checks it and stamps it likely fake" className="relative">
      {stage >= STAMP && <span className="stamp absolute -right-2 -top-5 z-20 border-4 border-high bg-white px-3 py-1 font-display text-2xl font-extrabold text-high shadow-lg">Likely fake</span>}
      <div className="relative min-h-[27rem] overflow-hidden rounded-lg bg-white text-black shadow-2xl ring-1 ring-white/10">
        {scanning && <span aria-hidden className="scanline absolute inset-x-0 z-10 h-16" />}
        <div className="flex items-center gap-1.5 border-b border-rule bg-[#f1eeea] px-4 py-2.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-[#e7776b]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#e8c05a]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#6cc08b]" />
          <span className="ml-3 text-xs text-muted">mail.google.com</span>
          {scanning && <span className="ml-auto text-xs font-bold text-pad">MAILicious is checking…</span>}
        </div>
        <div className="p-5">
          <p className="font-display text-xl font-bold">Congratulations! You are selected</p>
          <p className="mt-1 text-sm text-muted">Microsoft HR &lt;hr.microsoft.india@gmail.com&gt;</p>

          {stage >= VERDICT ? (
            <div className="rise mt-4 border-l-4 border-high bg-[#fbeaec] p-4 text-sm">
              <p>
                <span className="text-base font-extrabold text-high">Likely fake</span> <span className="ml-1 text-muted">Advance-fee scam</span>
              </p>
              <p className="mt-2">It asks you to pay money. Real companies don&apos;t charge you to get hired.</p>
              <p className="mt-2 font-bold">Do not pay anything. Check with the placement cell.</p>
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6">Pay the refundable registration fee of Rs 1500 and share the OTP sent to your phone within 2 hours to confirm your seat. No interview is needed.</p>
          )}

          <ul className="mt-4 space-y-1.5 text-sm">
            {CHECKS.map(([label, detail, status], i) => (
              <li key={label} className={`flex items-baseline gap-2 ${stage >= FIRST_CHECK + i ? "rise" : "invisible"}`}>
                <span aria-hidden className={`w-4 font-bold ${SIGN[status][1]}`}>
                  {SIGN[status][0]}
                </span>
                <span className="font-bold">{label}</span>
                <span className="text-muted">{detail}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <figcaption className="mt-3 flex items-center justify-between gap-3 text-sm text-white/70">
        <span>A fictional example of a fake offer.</span>
        <button
          type="button"
          onClick={() => {
            setStage(0);
            setRun((r) => r + 1);
          }}
          className="text-flame underline underline-offset-4"
        >
          Replay
        </button>
      </figcaption>
    </figure>
  );
}

const STEPS = [
  {
    title: "Install it once",
    body: "Download the extension and load it in Chrome, Brave or Edge. It takes about a minute, and there's no account or Google sign-in.",
    visual: <p className="text-sm">brave://extensions → Developer mode → Load unpacked</p>,
  },
  {
    title: "Just open your mail",
    body: "There's nothing to paste. A normal mail gets one quiet line, so you can carry on reading.",
    visual: <p className="text-sm text-low">✓ MAILicious: Verified college office. Details are in the toolbar icon.</p>,
  },
  {
    title: "Heed the warning",
    body: "A risky mail gets a short banner with one next step. Its links pause before opening, and you're warned if you type an OTP or Aadhaar into a reply.",
    visual: (
      <div className="border-l-4 border-high bg-[#fbeaec] p-3 text-sm">
        <span className="font-extrabold text-high">Likely fake</span> Do not share the code.
      </div>
    ),
  },
  {
    title: "Open the icon for the full story",
    body: "Click MAILicious in your toolbar to see each check in plain English, why it matters, and report the sender to your placement cell.",
    visual: (
      <p className="text-sm">
        <span className="inline-block rounded-full bg-high px-2 font-bold text-white">!!</span> Badge on the icon: click it for the full report
      </p>
    ),
  },
] as const;

export function Guide() {
  const [step, setStep] = useState(0);
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[20rem_1fr]">
      <div role="tablist" aria-label="Guide steps" aria-orientation="vertical" className="space-y-2">
        {STEPS.map((s, i) => (
          <button
            key={s.title}
            type="button"
            role="tab"
            id={`guide-tab-${i}`}
            aria-selected={step === i}
            aria-controls="guide-panel"
            onClick={() => setStep(i)}
            className={`flex w-full items-center gap-3 border-l-4 px-4 py-3 text-left font-bold ${step === i ? "border-flame bg-black text-white" : "border-rule bg-sheet text-black hover:border-black"}`}
          >
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm ${step === i ? "bg-flame text-black" : "bg-black text-white"}`}>{i + 1}</span>
            {s.title}
          </button>
        ))}
      </div>
      <div key={step} id="guide-panel" role="tabpanel" aria-labelledby={`guide-tab-${step}`} className="rise border border-rule bg-sheet p-6 sm:p-8">
        <h3 className="font-display text-2xl font-bold">{STEPS[step].title}</h3>
        <p className="mt-3 max-w-xl text-lg text-muted">{STEPS[step].body}</p>
        <div className="mt-6 rounded-md border border-rule bg-white p-4">{STEPS[step].visual}</div>
        <div className="mt-6 flex gap-3">
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)} className="border border-black px-4 py-2 font-bold">
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={() => setStep(step + 1)} className="bg-flame px-4 py-2 font-bold text-black hover:bg-black hover:text-white">
              Next
            </button>
          ) : (
            <a href="#extension" className="bg-flame px-4 py-2 font-bold text-black hover:bg-black hover:text-white">
              Get the extension
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
