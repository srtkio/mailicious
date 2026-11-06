"use client";

import { motion, useReducedMotion, useScroll, useSpring, useTransform, useVelocity } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Fills as the page scrolls.
export function ScrollBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 160, damping: 30 });
  return <motion.span aria-hidden style={{ scaleX }} className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-flame" />;
}

const INTRO_MS = 2150;

// Plays once a session. It's plain CSS, so it finishes even if the page's script never loads.
export function Intro({ onDone }: { onDone: () => void }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    let seen = false;
    try {
      seen = !!sessionStorage.getItem("mailicious-intro");
      sessionStorage.setItem("mailicious-intro", "1");
    } catch {
      // private windows can block storage, and the intro just plays again
    }
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wait = seen || still ? 0 : INTRO_MS;
    if (!wait) document.documentElement.style.setProperty("--intro", "0s");
    const timer = setTimeout(() => {
      setGone(true);
      onDone();
    }, wait);
    return () => clearTimeout(timer);
  }, [onDone]);

  if (gone) return null;
  return (
    <div aria-hidden className="intro">
      <div className="intro-mark">
        <svg viewBox="0 0 120 96" className="intro-envelope">
          <rect x="6" y="10" width="108" height="76" rx="6" pathLength={1} />
          <path d="M8 14l52 42 52-42" pathLength={1} />
        </svg>
        <span className="intro-beam" />
        <svg viewBox="0 0 32 32" className="intro-shield">
          <path d="M16 2l12 4.5v8.2c0 7.1-4.9 11.6-12 15.3C8.9 26.3 4 21.8 4 14.7V6.5L16 2z" fill="#ff6a00" />
          <path d="M10.5 15.5l4 4 7-8" fill="none" stroke="#0a0a0a" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
        </svg>
      </div>
      <p className="intro-word">
        MAIL<span>icious</span>
      </p>
      <span className="intro-load" />
    </div>
  );
}

const LINES = 54;
const POINTS = 96;

type Sheet = { from: [number, number]; a: [number, number]; b: [number, number]; to: [number, number]; alpha: number; width: number };
const HERO: Sheet = { from: [-0.08, 1.04], a: [0.34, 0.6], b: [0.7, 1.16], to: [1.1, 0.06], alpha: 0.26, width: 0.3 };

// The deck's silk, alive: threads along a twisting ribbon, drawn with additive light so crossings glow.
export function Silk({ sheet = HERO, className = "" }: { sheet?: Sheet; className?: string }) {
  const box = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = box.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let [w, h, frame, shown, push, pushTo] = [0, 0, 0, true, 0, 0];
    const xs = new Float32Array(POINTS + 1);
    const ys = new Float32Array(POINTS + 1);
    const nx = new Float32Array(POINTS + 1);
    const ny = new Float32Array(POINTS + 1);
    const spine = () => {
      const { from, a, b, to } = sheet;
      for (let i = 0; i <= POINTS; i++) {
        const s = i / POINTS;
        const r = 1 - s;
        const at = (k: 0 | 1) => r * r * r * from[k] + 3 * r * r * s * a[k] + 3 * r * s * s * b[k] + s * s * s * to[k];
        const slope = (k: 0 | 1) => 3 * r * r * (a[k] - from[k]) + 6 * r * s * (b[k] - a[k]) + 3 * s * s * (to[k] - b[k]);
        xs[i] = at(0) * w;
        ys[i] = at(1) * h;
        const [dx, dy] = [slope(0) * w, slope(1) * h];
        const length = Math.hypot(dx, dy) || 1;
        nx[i] = -dy / length;
        ny[i] = dx / length;
      }
    };
    const size = () => {
      const scale = Math.min(devicePixelRatio, 1.5);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * scale;
      canvas.height = h * scale;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      spine();
    };
    const draw = (t: number) => {
      push += (pushTo - push) * 0.04;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = 1;
      const span = h * sheet.width;
      for (let line = 0; line < LINES; line++) {
        const u = (line / (LINES - 1)) * 2 - 1;
        ctx.strokeStyle = `rgba(255, ${96 + Math.round(60 * Math.abs(u))}, ${Math.round(24 * Math.abs(u))}, ${sheet.alpha * (1 - 0.5 * Math.abs(u))})`;
        ctx.beginPath();
        for (let i = 0; i <= POINTS; i++) {
          const s = i / POINTS;
          const twist = 8.4 * s + t * 0.00022 + push + 0.9 * u * Math.sin(4.4 * s + t * 0.00016);
          const wide = span * (0.14 + 0.86 * Math.sin(Math.PI * s) ** 1.2);
          const off = wide * (u * Math.cos(twist) + 0.14 * u * Math.sin(19 * s + 2.2 * u + t * 0.0003));
          const x = xs[i] + nx[i] * off;
          const y = ys[i] + ny[i] * off;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    };
    const loop = (t: number) => {
      draw(t);
      frame = shown ? requestAnimationFrame(loop) : 0;
    };
    const wake = () => {
      if (shown && !frame && !still && !document.hidden) frame = requestAnimationFrame(loop);
    };
    const onScreen = new IntersectionObserver(([entry]) => {
      shown = entry.isIntersecting;
      wake();
    });
    const pointer = (e: PointerEvent) => {
      pushTo = (e.clientX / innerWidth - 0.5) * 1.1;
    };
    const resize = new ResizeObserver(() => {
      size();
      draw(2400);
    });
    resize.observe(canvas);
    onScreen.observe(canvas);
    addEventListener("pointermove", pointer, { passive: true });
    document.addEventListener("visibilitychange", wake);
    return () => {
      cancelAnimationFrame(frame);
      shown = false;
      resize.disconnect();
      onScreen.disconnect();
      removeEventListener("pointermove", pointer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [sheet]);
  return <canvas ref={box} aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />;
}

// A word band that leans into fast scrolling.
export function Marquee({ items }: { items: readonly string[] }) {
  const { scrollY } = useScroll();
  const speed = useSpring(useVelocity(scrollY), { stiffness: 120, damping: 40 });
  const skewX = useTransform(speed, [-2400, 2400], [10, -10], { clamp: true });
  const calm = useReducedMotion();
  const row = items.flatMap((item) => [item, "✕"]);
  return (
    <div className="overflow-hidden border-y-2 border-black bg-flame py-3 text-black">
      <p className="sr-only">{items.join(", ")}</p>
      <motion.div aria-hidden style={calm ? undefined : { skewX }} className="marquee flex w-max gap-6 whitespace-nowrap font-display text-xl font-extrabold">
        {[...row, ...row, ...row, ...row].map((word, i) => (
          <span key={i}>{word}</span>
        ))}
      </motion.div>
    </div>
  );
}

// Rises in, with its siblings following one after another.
export function Stagger({ children, className = "", index = 0 }: { children: ReactNode; className?: string; index?: number }) {
  const calm = useReducedMotion();
  return (
    <motion.div initial={calm ? false : { opacity: 0, y: 26 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -8% 0px" }} transition={{ duration: 0.6, delay: index * 0.08, ease: [0.2, 0.8, 0.2, 1] }} className={className}>
      {children}
    </motion.div>
  );
}
