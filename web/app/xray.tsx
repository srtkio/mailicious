"use client";

import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";

const TRICKS = [
  { name: "Borrowed authority", note: "A big name, on a personal Gmail." },
  { name: "Flattery", note: "You won, so you stop questioning it." },
  { name: "A ticking clock", note: "Two hours leaves no time to ask anyone." },
  { name: "The real goal", note: "Your money and your OTP." },
];
const STEP_AT = [0.1, 0.3, 0.5, 0.68];
const STAMP_AT = 0.84;

function Mark({ on, children }: { on: boolean; children: string }) {
  return <span className={`rounded-sm px-0.5 transition-colors duration-300 ${on ? "bg-flame text-black" : ""}`}>{children}</span>;
}

// Pinned: scrolling drives the beam down a fake offer and calls out each trick in turn.
export function ScrollXray() {
  const calm = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: box, offset: ["start start", "end end"] });
  const [progress, setProgress] = useState(calm ? 1 : 0);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (!calm) setProgress(v);
  });
  const beam = useTransform(scrollYProgress, [0.02, STAMP_AT], ["-10%", "104%"]);
  const fill = useTransform(scrollYProgress, [0, STAMP_AT], [0, 1]);
  const lit = (i: number) => progress >= STEP_AT[i];
  const stamped = progress >= STAMP_AT;
  const current = STEP_AT.filter((at) => progress >= at).length - 1;

  return (
    <section ref={box} aria-label="How a fake offer is built" className={calm ? "bg-night text-white" : "h-[300vh] bg-night text-white"}>
      <div className={`flex flex-col justify-center overflow-hidden ${calm ? "py-20" : "sticky top-0 h-screen"}`}>
        <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:gap-14">
          <div>
            <p className="font-bold text-flame">X-ray of a fake offer</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold leading-tight sm:text-5xl">Scroll to see what&apos;s really inside.</h2>
            <ol className="mt-6 hidden space-y-3 lg:block">
              {TRICKS.map((trick, i) => (
                <li key={trick.name} className={`flex gap-4 transition-opacity duration-300 ${lit(i) ? "opacity-100" : "opacity-30"}`}>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-bold transition-colors duration-300 ${lit(i) ? "bg-flame text-black" : "bg-white/15 text-white"}`}>{i + 1}</span>
                  <span>
                    <span className="block font-display text-xl font-bold">{trick.name}</span>
                    <span className="text-white/70">{trick.note}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-4 h-16 lg:hidden">
              <AnimatePresence mode="wait">
                {current >= 0 && (
                  <motion.p key={current} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                    <span className="block font-display text-xl font-bold text-flame">{TRICKS[current].name}</span>
                    <span className="text-white/70">{TRICKS[current].note}</span>
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>

          <figure className="relative">
            <div className="relative overflow-hidden rounded-lg bg-white p-5 text-black shadow-2xl sm:p-7">
              {!calm && <motion.span aria-hidden style={{ top: beam }} className="xray-beam absolute inset-x-0 z-10 h-20" />}
              <p className="font-display text-xl font-bold sm:text-2xl">
                <Mark on={lit(1)}>Congratulations! You are selected</Mark>
              </p>
              <p className="mt-1 text-sm text-muted">
                <Mark on={lit(0)}>Microsoft HR</Mark> &lt;hr.microsoft.india@gmail.com&gt;
              </p>
              <p className="mt-5 text-base leading-7 sm:text-lg sm:leading-8">
                Dear student, your profile has been shortlisted and no interview is needed. To confirm your seat, <Mark on={lit(3)}>pay the refundable fee of Rs 1500 and share your OTP</Mark> <Mark on={lit(2)}>within 2 hours</Mark>. After that, your offer letter will be released.
              </p>
              <p className="mt-5 text-sm text-muted">A fictional example.</p>
            </div>
            <motion.span aria-hidden style={{ scaleX: fill }} className="mt-3 block h-1 origin-left rounded-full bg-flame" />
            <AnimatePresence>
              {stamped && (
                <motion.span initial={calm ? false : { opacity: 0, scale: 1.8, rotate: -9 }} animate={{ opacity: 1, scale: 1, rotate: -5 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 520, damping: 22 }} className="absolute bottom-10 right-2 z-20 border-4 border-high bg-white px-4 py-1.5 font-display text-2xl font-extrabold text-high shadow-xl sm:-right-1 sm:-top-5 sm:bottom-auto sm:text-3xl">
                  Likely fake
                </motion.span>
              )}
            </AnimatePresence>
          </figure>
        </div>
      </div>
    </section>
  );
}
