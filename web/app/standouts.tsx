"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent } from "react";
import { dnaDistance, SAME_SCRIPT_BITS, scamDna } from "@/lib/dna";
import { activeContent, auditLetter, pdfDate, type LetterReport } from "@/lib/forensics";
import { complaint, rescuePlan, SLIPS, type Slip } from "@/lib/rescue";

const SCRIPT =
  "Congratulations! You have been selected for the Northwind summer internship 2026 at our Bangalore office. No interview is needed and your profile has been shortlisted by our senior recruitment team. Pay the refundable registration fee of Rs 1500 to our finance desk and share the OTP sent to your phone within 2 hours to confirm your seat. After confirmation you will receive your offer letter and joining kit. Failure to respond will cancel your selection.";
const SWAPPED = SCRIPT.replace(/Northwind/g, "Zenova").replace("Rs 1500", "Rs 2200").replace("Bangalore", "Pune").replace("2 hours", "3 hours");
const REWORDED = SWAPPED.replace("Congratulations!", "Greetings candidate,").replace("finance desk", "accounts team").replace("senior recruitment team", "talent acquisition group").replace("joining kit", "induction pack");
const NORMAL =
  "Hi everyone, the placement cell has scheduled the pre-placement talk for Thursday at 3pm in the main auditorium. The company will walk through the role, the selection process and the campus timeline. Please carry your college ID and a printed resume. Attendance is compulsory for students who registered on the portal. Questions can be raised with your department coordinator before the session begins.";

const VARIANTS = [
  { label: "New sender", sender: "talent.desk.northwind@gmail.com", text: SCRIPT },
  { label: "New company and amount", sender: "offers.zenova.hr@gmail.com", text: SWAPPED },
  { label: "Reworded", sender: "campus.zenova@outlook.com", text: REWORDED },
  { label: "A normal mail", sender: "placements@college.example", text: NORMAL },
];

const bitsOf = (dna: string) => [...BigInt(`0x${dna}`).toString(2).padStart(64, "0")];

function Barcode({ dna, against, label }: { dna: string; against?: string; label: string }) {
  const bits = bitsOf(dna);
  const other = against ? bitsOf(against) : null;
  return (
    <div role="img" aria-label={label} className="flex h-14 items-end gap-[2px]">
      {bits.map((bit, i) => (
        <motion.span key={i} initial={false} animate={{ height: bit === "1" ? "100%" : "38%", backgroundColor: other && other[i] !== bit ? "#ffffff" : "#ff6a00" }} transition={{ duration: 0.35, delay: i * 0.004 }} className="min-w-0 flex-1 rounded-[1px]" />
      ))}
    </div>
  );
}

// Runs the real fingerprint in the browser, so what you see is the actual check.
export function DnaLab() {
  const [pick, setPick] = useState(0);
  const known = useMemo(() => scamDna(SCRIPT)!, []);
  const variant = VARIANTS[pick];
  const dna = useMemo(() => scamDna(variant.text)!, [variant]);
  const distance = dnaDistance(known, dna);
  const match = Math.round((1 - distance / 64) * 100);
  const caught = distance <= SAME_SCRIPT_BITS;
  return (
    <div className="rounded-lg border border-white/15 bg-black/50 p-5 backdrop-blur sm:p-6">
      <p className="text-sm text-white/70">Reported on campus and marked fake</p>
      <div className="mt-2">
        <Barcode dna={known} label="Fingerprint of the reported scam" />
      </div>
      <p className="mt-5 text-sm text-white/70">The scammer tries again</p>
      <div role="group" aria-label="Change the mail" className="mt-2 flex flex-wrap gap-2">
        {VARIANTS.map((v, i) => (
          <button key={v.label} type="button" aria-pressed={pick === i} onClick={() => setPick(i)} className={`rounded-full border px-3 py-1 text-sm font-bold transition-colors ${pick === i ? "border-flame bg-flame text-black" : "border-white/30 text-white hover:border-white"}`}>
            {v.label}
          </button>
        ))}
      </div>
      <p className="mt-3 truncate text-sm text-white/70">From: {variant.sender}</p>
      <p className="mt-1 line-clamp-2 text-sm text-white/90">{variant.text}</p>
      <div className="mt-3">
        <Barcode dna={dna} against={known} label={`Fingerprint of this mail. ${distance} of 64 bits differ.`} />
      </div>
      <div aria-live="polite" className="mt-4 flex items-baseline justify-between gap-4">
        <motion.p key={match} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className={`font-display text-4xl font-extrabold ${caught ? "text-flame" : "text-white"}`}>
          {match}%
        </motion.p>
        <p className="text-right font-bold">{caught ? "Same script. Caught, whoever sends it." : "Different mail. Left alone."}</p>
      </div>
    </div>
  );
}

const SIGN = { pass: ["✓", "text-low"], warn: ["!", "text-medium"], fail: ["✕", "text-high"] } as const;
const OUTCOME = { high: ["This letter is fake", "text-high"], medium: ["Verify before you trust this", "text-medium"], low: ["Nothing wrong found", "text-low"] } as const;
const MAX_FILE = 15 * 1024 * 1024;

async function readLetter(file: Blob): Promise<LetterReport> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const active = activeContent(bytes);
  const { extractText, getDocumentProxy, getMeta } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes.slice()); // the reader takes ownership of what it's given
  const [{ text, totalPages }, { info }] = await Promise.all([extractText(pdf, { mergePages: true }), getMeta(pdf)]);
  const field = (key: string) => (info as unknown as Record<string, unknown>)[key];
  return auditLetter({ text, pages: totalPages, active, producer: String(field("Producer") ?? "") || undefined, creator: String(field("Creator") ?? "") || undefined, created: pdfDate(field("CreationDate")), modified: pdfDate(field("ModDate")) });
}

export function LetterLab() {
  const [state, setState] = useState<"idle" | "reading" | "done">("idle");
  const [report, setReport] = useState<LetterReport | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);

  async function scan(file: Blob, label: string) {
    setError("");
    setReport(null);
    if (file.size > MAX_FILE) return setError("That file is over 15 MB. Offer letters are much smaller.");
    setName(label);
    setState("reading");
    try {
      const [result] = await Promise.all([readLetter(file), new Promise((wait) => setTimeout(wait, 900))]);
      setReport(result);
      setState("done");
    } catch {
      setState("idle");
      setError("We couldn't read that as a PDF. Try another copy of the letter.");
    }
  }
  const take = (file?: File) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return setError("Choose a PDF file.");
    scan(file, file.name);
  };
  const sample = async () => {
    const res = await fetch("/samples/fake-offer-letter.pdf").catch(() => null);
    if (res?.ok) scan(await res.blob(), "fake-offer-letter.pdf");
    else setError("Couldn't load the sample. Try again.");
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files[0]);
  };

  return (
    <div className="rounded-lg border border-white/15 bg-black/50 p-5 backdrop-blur sm:p-6">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={`relative block cursor-pointer overflow-hidden rounded-md border-2 border-dashed p-6 text-center transition-colors focus-within:outline focus-within:outline-3 focus-within:outline-flame ${over ? "border-flame bg-flame/15" : "border-white/30 hover:border-white"}`}
      >
        {state === "reading" && <span aria-hidden className="paper-scan xray-beam absolute inset-x-0 h-8" />}
        <input type="file" accept="application/pdf,.pdf" onChange={(e: ChangeEvent<HTMLInputElement>) => take(e.target.files?.[0])} className="sr-only" />
        <span className="block font-display text-xl font-bold">{state === "reading" ? `Scanning ${name}…` : "Drop an offer letter PDF"}</span>
        <span className="mt-1 block text-sm text-white/70">or click to choose one. It never leaves your device.</span>
      </label>
      <button type="button" onClick={sample} disabled={state === "reading"} className="mt-3 text-sm font-bold text-flame underline underline-offset-4 disabled:opacity-60">
        Try a sample fake letter
      </button>
      {error && (
        <p role="alert" className="mt-3 font-bold text-[#ff9b9b]">
          {error}
        </p>
      )}
      <AnimatePresence>
        {report && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} aria-live="polite" className="mt-4 rounded-md bg-white p-4 text-black">
            <p className={`stamp inline-block font-display text-2xl font-extrabold ${OUTCOME[report.level][1]}`}>{OUTCOME[report.level][0]}</p>
            <ul className="mt-2 space-y-1.5">
              {report.findings.map((f, i) => (
                <li key={f.label} style={{ "--i": i } as CSSProperties} className="tick-in grid grid-cols-[1.25rem_1fr] gap-1 text-sm">
                  <span aria-hidden className={`font-bold ${SIGN[f.status][1]}`}>
                    {SIGN[f.status][0]}
                  </span>
                  <span>
                    <span className="font-bold">{f.label}:</span> <span className="text-muted">{f.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const WHEN = { "Right now": "bg-high text-white", "Within the hour": "bg-medium text-white", Today: "bg-night text-white" } as const;

// A panic moment, so one tap per fact, the most urgent step first, and the paperwork already written.
export function Rescue({ dark = true }: { dark?: boolean }) {
  const calm = useReducedMotion();
  const [slips, setSlips] = useState<Slip[]>([]);
  const [sender, setSender] = useState("");
  const [attack, setAttack] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The extension hands over the sender in the #fragment, which browsers never send to any server.
  useEffect(() => {
    const given = new URLSearchParams(location.hash.slice(1));
    const fill = setTimeout(() => {
      setSender((given.get("sender") ?? "").slice(0, 320));
      setAttack((given.get("attack") ?? "").slice(0, 60));
    }, 0);
    return () => clearTimeout(fill);
  }, []);

  const toggle = (slip: Slip) => setSlips((now) => (now.includes(slip) ? now.filter((s) => s !== slip) : [...now, slip]));
  const plan = rescuePlan(slips);
  const letter = plan.length ? complaint(slips, { sender, attack, amount, reference }) : ""; // reads the clock, so never during prerender
  const copy = async () => {
    await navigator.clipboard.writeText(letter).catch(() => null);
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };
  const askHelp = `https://wa.me/?text=${encodeURIComponent(`I think I got caught by a scam mail and need help.\n\n${letter}`)}`;
  const field = `mt-1 block w-full border px-3 py-2 text-base text-black ${dark ? "border-white/30 bg-white" : "border-rule bg-white"}`;

  return (
    <div className={`rounded-lg border p-5 sm:p-6 ${dark ? "border-white/15 bg-black/50 backdrop-blur" : "border-rule bg-sheet"}`}>
      <p className="font-bold">What happened? Tap all that apply.</p>
      <div role="group" aria-label="What happened" className="mt-3 flex flex-wrap gap-2">
        {SLIPS.map(([slip, label]) => {
          const on = slips.includes(slip);
          return (
            <button key={slip} type="button" aria-pressed={on} onClick={() => toggle(slip)} className={`rounded-full border px-3 py-1.5 text-sm font-bold transition-colors ${on ? "border-flame bg-flame text-black" : dark ? "border-white/30 hover:border-white" : "border-black/30 hover:border-black"}`}>
              {label}
            </button>
          );
        })}
      </div>
      <AnimatePresence initial={false}>
        {plan.length > 0 && (
          <motion.div initial={calm ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <ol className="mt-5 space-y-2">
              <AnimatePresence initial={false}>
                {plan.map((step) => (
                  <motion.li key={step.title} layout={!calm} initial={calm ? false : { opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="rounded-md bg-white p-3 text-black">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-sm px-2 py-0.5 text-xs font-bold ${WHEN[step.when]}`}>{step.when}</span>
                      <h4 className="font-display font-bold">{step.title}</h4>
                    </div>
                    <p className="mt-1 text-sm text-muted">{step.body}</p>
                    {step.href && (
                      <a href={step.href} target={step.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="mt-1 inline-block text-sm font-bold text-pad underline underline-offset-4">
                        {step.action}
                      </a>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
            <h4 className="mt-5 font-display text-lg font-bold">Your complaint, already written</h4>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Sender&apos;s address
                <input value={sender} maxLength={320} onChange={(e) => setSender(e.target.value)} className={field} />
              </label>
              <label className="text-sm">
                Amount lost, if any
                <input value={amount} maxLength={40} onChange={(e) => setAmount(e.target.value)} className={field} />
              </label>
              <label className="text-sm sm:col-span-2">
                Transaction ID, if you have it
                <input value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} className={field} />
              </label>
            </div>
            <pre className="mt-3 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-md bg-white p-3 font-sans text-sm text-black">{letter}</pre>
            <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
              <button type="button" onClick={copy} className="bg-flame px-4 py-2 font-bold text-black hover:bg-white">
                {copied ? "Copied" : "Copy the complaint"}
              </button>
              <a href={askHelp} target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-4">
                Ask someone you trust on WhatsApp
              </a>
            </p>
            <p className={`mt-2 text-sm ${dark ? "text-white/70" : "text-muted"}`}>This page saves nothing. Your details stay on this device until you copy or share them.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
