"use client";

import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { type PointerEvent, type ReactNode } from "react";

// Evidence drifting round the mail. Fictional, like the mail itself.
const CHIPS = [
  { text: "DMARC failed", tone: "border-high text-high", spot: "-left-20 top-1", depth: 34, drift: "drift-a" },
  { text: "Domain is 3 days old", tone: "border-medium text-medium", spot: "-right-20 top-24", depth: 22, drift: "drift-b" },
  { text: "Asks for an OTP", tone: "border-high text-high", spot: "-left-32 bottom-16", depth: 44, drift: "drift-b" },
  { text: "Rs 1500 fee", tone: "border-high text-high", spot: "-right-16 bottom-20", depth: 28, drift: "drift-a" },
] as const;

function Chip({ chip, x, y }: { chip: (typeof CHIPS)[number]; x: MotionValue<number>; y: MotionValue<number> }) {
  const tx = useTransform(x, [-0.5, 0.5], [-chip.depth, chip.depth]);
  const ty = useTransform(y, [-0.5, 0.5], [-chip.depth, chip.depth]);
  return (
    <motion.span aria-hidden style={{ x: tx, y: ty }} className={`absolute z-30 hidden xl:block ${chip.spot}`}>
      <span className={`${chip.drift} block rounded-full border-2 bg-white px-3 py-1 text-sm font-bold shadow-xl ${chip.tone}`}>{chip.text}</span>
    </motion.span>
  );
}

// Tilts towards the pointer, with the evidence floating at different depths.
export function HeroStage({ children }: { children: ReactNode }) {
  const calm = useReducedMotion();
  const x = useSpring(useMotionValue(0), { stiffness: 90, damping: 18 });
  const y = useSpring(useMotionValue(0), { stiffness: 90, damping: 18 });
  const rotateY = useTransform(x, [-0.5, 0.5], [-7, 7]);
  const rotateX = useTransform(y, [-0.5, 0.5], [6, -6]);
  const track = (e: PointerEvent<HTMLDivElement>) => {
    if (calm || e.pointerType !== "mouse") return;
    const box = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - box.left) / box.width - 0.5);
    y.set((e.clientY - box.top) / box.height - 0.5);
  };
  const rest = () => {
    x.set(0);
    y.set(0);
  };
  return (
    <div onPointerMove={track} onPointerLeave={rest} className="hero-card relative [perspective:1200px]">
      {CHIPS.map((chip) => (
        <Chip key={chip.text} chip={chip} x={x} y={y} />
      ))}
      <motion.div style={calm ? undefined : { rotateX, rotateY }}>{children}</motion.div>
    </div>
  );
}

// The hero sinks away as the page scrolls past it.
export function HeroFade({ children, className = "" }: { children: ReactNode; className?: string }) {
  const calm = useReducedMotion();
  const { scrollY } = useScroll();
  const scale = useTransform(scrollY, [0, 720], [1, 0.93]);
  const opacity = useTransform(scrollY, [120, 720], [1, 0.25]);
  const y = useTransform(scrollY, [0, 720], [0, 70]);
  return (
    <motion.div style={calm ? undefined : { scale, opacity, y }} className={className}>
      {children}
    </motion.div>
  );
}
