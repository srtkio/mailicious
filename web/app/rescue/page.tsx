"use client";

import Link from "next/link";
import { Logo } from "../nav";
import { Rescue } from "../standouts";

export default function RescuePage() {
  return (
    <main className="min-h-screen bg-night text-white">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8">
        <Link href="/" className="inline-flex items-center gap-2 font-display text-xl font-extrabold">
          <Logo /> MAIL<span className="-ml-2 text-flame">icious</span>
        </Link>
        <h1 className="mt-8 font-display text-4xl font-extrabold leading-tight">Damage Control</h1>
        <p className="mt-3 text-lg text-white/80">It happens to careful people too. Take a breath, and work from the top. Speed matters more than anything else right now.</p>
        <div className="mt-6">
          <Rescue />
        </div>
      </div>
    </main>
  );
}
