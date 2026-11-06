"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

const LINKS = [
  ["guide", "Guide"],
  ["how", "How it works"],
  ["drill", "Scam Drill"],
  ["radar", "Live Radar"],
  ["check", "Try it"],
] as const;

export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={className}>
      <path d="M16 2l12 4.5v8.2c0 7.1-4.9 11.6-12 15.3C8.9 26.3 4 21.8 4 14.7V6.5L16 2z" fill="#ff6a00" />
      <path d="M10.5 15.5l4 4 7-8" fill="none" stroke="#0a0a0a" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Nav() {
  const [active, setActive] = useState("");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    for (const [id] of LINKS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label="Main" className="sticky top-0 z-50 border-b border-white/10 bg-night/90 text-white backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-x-6 gap-y-2 overflow-x-auto px-4 py-3 sm:px-8">
        <a href="#top" className="flex shrink-0 items-center gap-2 font-display text-xl font-extrabold">
          <Logo />
          <span>
            MAIL<span className="text-flame">icious</span>
          </span>
        </a>
        <span className="flex shrink-0 items-center gap-x-5 text-sm">
          {LINKS.map(([id, label]) => (
            <a key={id} href={`#${id}`} aria-current={active === id ? "true" : undefined} className={`border-b-2 py-1 ${active === id ? "border-flame text-white" : "border-transparent text-white/70 hover:text-white"}`}>
              {label}
            </a>
          ))}
          <Link href="/technology" className="border-b-2 border-transparent py-1 text-white/70 hover:text-white">
            Technology
          </Link>
          <a href="#extension" className="bg-flame px-3 py-1.5 font-bold text-black hover:bg-white">
            Get the extension
          </a>
        </span>
      </div>
    </nav>
  );
}

// Rises in once as it scrolls into view. The CSS leaves it visible for reduced motion.
export function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={box} className={`reveal ${seen ? "reveal-in" : ""} ${className}`}>
      {children}
    </div>
  );
}
