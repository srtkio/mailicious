"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CheckResult, Level } from "@/lib/types";

const VERDICT: Record<Level, { stamp: string; color: string }> = {
  high: { stamp: "Likely fake", color: "text-high border-high" },
  medium: { stamp: "Check first", color: "text-medium border-medium" },
  low: { stamp: "No red flags", color: "text-low border-low" },
};

// Fictional mails for trying the checker. Neither has a link, so a demo click fetches nothing.
const SAMPLES = [
  {
    label: "Try a fake offer",
    sender: "hr.microsoft.india@gmail.com",
    text: "Congratulations! You have been selected for the Microsoft summer internship. No interview is needed.\n\nPay the refundable registration fee of Rs 1500 and share the OTP sent to your phone within 2 hours to confirm your seat.",
  },
  {
    label: "Try a normal invite",
    sender: "careers@infosys.com",
    text: "Your interview is on Monday at 10am. Stipend: pay of ₹20,000 per month.\n\nApply for your slot on the careers portal. Never share your OTP or password with anyone.",
  },
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
        body: JSON.stringify({ text, sender }),
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

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-8 sm:py-14">
      <h1 className="max-w-2xl font-display text-4xl font-bold leading-tight sm:text-5xl">Got a placement mail that feels off?</h1>
      <p className="mt-3 max-w-xl text-lg text-muted">Paste it here before you reply, pay or click.</p>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1fr_22rem]">
        <form onSubmit={check}>
          <label htmlFor="mail" className="font-bold">
            The mail
          </label>
          <textarea
            id="mail"
            required
            maxLength={20000}
            rows={10}
            value={text}
            onChange={(e) => edit(e.target.value, sender)}
            className="ledger mt-2 block w-full resize-y border border-rule px-4 text-base"
          />

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

        <section aria-live="polite" className="lg:pt-8">
          {error && <p className="font-bold text-high">{error}</p>}
          {!result && !error && <p className="hidden text-muted lg:block">Your result shows here. It takes a few seconds, and nothing you paste is saved.</p>}
          {result && <Verdict result={result} />}
        </section>
      </div>
    </main>
  );
}

function Verdict({ result }: { result: CheckResult }) {
  const { stamp, color } = VERDICT[result.level];
  const evidence = [result.evidence.sender, result.evidence.company, result.evidence.link].filter((e): e is string => !!e);
  const top = useRef<HTMLDivElement>(null);
  // On a phone the verdict lands below the fold. Braces matter: scrollIntoView's return value must not reach React as a cleanup.
  useEffect(() => {
    top.current?.scrollIntoView({ block: "nearest" });
  }, []);
  const more = result.flags.map((f) => f.text).filter((t) => !result.reasons.includes(t) && !evidence.includes(t));

  return (
    <div ref={top} className="pt-3">
      <p className={`stamp inline-block border-4 px-4 py-2 font-display text-3xl font-extrabold ${color}`}>{stamp}</p>

      <ul className="mt-6 space-y-2">
        {result.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      <p className="mt-5 font-bold">{result.nextStep}</p>

      <details className="mt-6 border-t border-rule pt-3">
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
          {result.mode === "limited" && <p>This was a quick check of the text, sender and links. It didn&apos;t look the company up online.</p>}
        </div>
      </details>
    </div>
  );
}
