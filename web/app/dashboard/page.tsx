"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { Dashboard } from "@/lib/store";

export default function DashboardPage() {
  const [password, setPassword] = useState("");
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/admin", { headers: { authorization: `Bearer ${password}` } });
    const body = await res.json();
    if (res.ok) setData(body);
    else setError(body.error ?? "Couldn't load the dashboard.");
  }

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    await load().catch(() => setError("Couldn't reach the server. Try again."));
    setBusy(false);
  }

  async function decide(target: string, verdict: "fake" | "genuine") {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin", { method: "POST", headers: { authorization: `Bearer ${password}`, "content-type": "application/json" }, body: JSON.stringify({ target, verdict }) });
      if (res.ok) await load();
      else setError((await res.json()).error ?? "Couldn't save that.");
    } catch {
      setError("Couldn't reach the server. Try again.");
    }
    setBusy(false);
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-8">
      <Link href="/" className="font-display text-xl font-extrabold">
        MAILicious
      </Link>
      <h1 className="mt-6 font-display text-3xl font-bold">Placement cell dashboard</h1>
      {error && (
        <p role="alert" className="mt-4 font-bold text-high">
          {error}
        </p>
      )}

      {!data ? (
        <form onSubmit={signIn} className="mt-6 max-w-sm">
          <label htmlFor="password" className="font-bold">
            Password
          </label>
          <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 block w-full border border-rule bg-sheet px-4 py-2 text-base" />
          <button type="submit" disabled={busy} className="mt-4 bg-flame px-6 py-3 font-bold text-black hover:bg-black hover:text-white disabled:opacity-60">
            {busy ? "Opening…" : "Open dashboard"}
          </button>
        </form>
      ) : (
        <>
          <dl className="mt-8 flex flex-wrap gap-x-12 gap-y-4">
            <div>
              <dt className="text-muted">Mails checked</dt>
              <dd className="font-display text-4xl font-bold">{data.checked}</dd>
            </div>
            <div>
              <dt className="text-muted">Flagged</dt>
              <dd className="font-display text-4xl font-bold text-high">{data.flagged}</dd>
            </div>
            <div>
              <dt className="text-muted">Senders blocked</dt>
              <dd className="font-display text-4xl font-bold">{data.verdicts.filter((v) => v.verdict === "fake").length}</dd>
            </div>
          </dl>

          <section className="mt-10 border-t border-rule pt-6">
            <h2 className="font-display text-2xl font-bold">Reported senders</h2>
            <p className="mt-1 text-muted">Mark a sender fake and every student sees it as Likely fake within a minute.</p>
            {data.queue.length === 0 && <p className="mt-4">No reports are waiting.</p>}
            <ul className="mt-4 divide-y divide-rule">
              {data.queue.map((q) => (
                <li key={q.target} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span>
                    <span className="font-bold break-all">{q.target}</span>
                    <span className="block text-muted">
                      {q.count} {q.count === 1 ? "report" : "reports"}
                      {q.attack ? `, ${q.attack}` : ""}
                    </span>
                  </span>
                  <span className="flex gap-3">
                    <button type="button" disabled={busy} onClick={() => decide(q.target, "fake")} className="bg-high px-4 py-2 font-bold text-white disabled:opacity-60">
                      Mark fake
                    </button>
                    <button type="button" disabled={busy} onClick={() => decide(q.target, "genuine")} className="border border-pad px-4 py-2 font-bold text-pad disabled:opacity-60">
                      Mark genuine
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-10 border-t border-rule pt-6">
            <h2 className="font-display text-2xl font-bold">Attacks seen</h2>
            {data.attacks.length === 0 && <p className="mt-4">None yet.</p>}
            <ul className="mt-4 max-w-2xl space-y-3">
              {data.attacks.map((a) => (
                <li key={a.name} title={`${a.count} ${a.name}`}>
                  <span className="flex justify-between gap-3">
                    <span>{a.name}</span>
                    <span className="font-bold">{a.count}</span>
                  </span>
                  <span className="mt-1 block h-2 rounded-sm bg-rule">
                    <span className="block h-2 rounded-sm bg-flame" style={{ width: `${(a.count / data.attacks[0].count) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-10 border-t border-rule pt-6">
            <h2 className="font-display text-2xl font-bold">Decisions</h2>
            {data.verdicts.length === 0 && <p className="mt-4">None yet.</p>}
            <ul className="mt-3 space-y-2">
              {data.verdicts.map((v) => (
                <li key={v.target} className="flex flex-wrap items-center gap-x-3">
                  <span className="break-all">{v.target}</span>
                  <span className={v.verdict === "fake" ? "font-bold text-high" : "font-bold text-low"}>{v.verdict === "fake" ? "Fake" : "Genuine"}</span>
                  <button type="button" disabled={busy} onClick={() => decide(v.target, v.verdict === "fake" ? "genuine" : "fake")} className="text-pad underline underline-offset-4 disabled:opacity-60">
                    Change
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
