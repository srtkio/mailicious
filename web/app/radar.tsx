"use client";

import { useEffect, useRef, useState } from "react";

type Radar = { checked: number; flagged: number; blocked: number; attacks: { name: string; count: number }[] };

function CountUp({ to }: { to: number }) {
  const [value, setValue] = useState(0);
  const frame = useRef(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      frame.current = requestAnimationFrame(() => setValue(to));
      return () => cancelAnimationFrame(frame.current);
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      setValue(Math.round(to * (1 - (1 - t) ** 3)));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [to]);
  return <>{value}</>;
}

export function CampusRadar() {
  const [data, setData] = useState<Radar | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const read = () => fetch("/api/radar").then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
    // A sleeping database can miss the first request, so one quiet retry before giving up.
    read()
      .catch(() => new Promise((wait) => setTimeout(wait, 1500)).then(read))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <p className="mt-6 text-muted">The radar isn&apos;t available right now.</p>;
  if (!data) return <p className="mt-6 text-muted">Reading the radar…</p>;
  const top = data.attacks[0]?.count ?? 1;
  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_1.2fr]">
      <dl className="grid grid-cols-3 gap-4">
        {[
          ["Mails checked", data.checked, ""],
          ["Flagged", data.flagged, "text-pad"],
          ["Senders blocked", data.blocked, ""],
        ].map(([label, value, color]) => (
          <div key={label as string} className="border-t-2 border-black pt-3">
            <dd className={`font-display text-4xl font-extrabold sm:text-5xl ${color}`}>
              <CountUp to={value as number} />
            </dd>
            <dt className="mt-1 text-sm text-muted">{label}</dt>
          </div>
        ))}
      </dl>
      <div>
        <h3 className="font-bold">Attack types seen</h3>
        {data.attacks.length === 0 && <p className="mt-2 text-muted">None yet. This fills in as students check mail.</p>}
        <ul className="mt-3 space-y-3">
          {data.attacks.map((a) => (
            <li key={a.name} title={`${a.count} ${a.name}`}>
              <span className="flex justify-between gap-3 text-sm">
                <span>{a.name}</span>
                <span className="font-bold">{a.count}</span>
              </span>
              <span className="mt-1 block h-2 rounded-sm bg-rule">
                <span className="grow-bar block h-2 rounded-sm bg-flame" style={{ width: `${(a.count / top) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
