// Held-out accuracy, offline: the same rule steps as /api/check, minus AI, search and link fetching.
// The score here is the one to quote: mails were written blind and never edited after a run.
import { afterAll, describe, expect, it } from "vitest";
import { HOLDOUT } from "@/fixtures/holdout";
import type { Mail } from "@/fixtures/mails";
import { checkRules, deepRules, findLinks } from "./engine";
import { analyzeHeaders } from "./headers";
import type { Level } from "./types";

const RANK: Record<Level, number> = { low: 0, medium: 1, high: 2 };

// Known misses, with the cause. it.fails keeps `npm test` green and goes red once one is fixed. Never edit the mail instead.
const KNOWN_MISSES: Record<string, string> = {};

function judge(m: Mail): Level {
  const headers = m.headers ? analyzeHeaders(m.headers) : null;
  const sender = m.sender || headers?.from || "";
  const links = [...new Set([...(m.linkPairs ?? []).map((l) => l.href), ...findLinks(m.text)])];
  const extra = [...(headers?.flags ?? []), ...deepRules({ sender, links, linkPairs: m.linkPairs, attachments: m.attachments })];
  return checkRules(m.text, sender, links, [], extra).level;
}
const ok = (m: Mail, level: Level) => (m.kind === "scam" ? RANK[level] >= RANK[m.min!] : RANK[level] <= RANK[m.max!]);

describe("held-out accuracy set", () => {
  const scams = HOLDOUT.filter((m) => m.kind === "scam");
  const genuine = HOLDOUT.filter((m) => m.kind === "genuine");
  const caught = scams.filter((m) => ok(m, judge(m))).length;
  const alarms = genuine.filter((m) => !ok(m, judge(m))).length;

  it("has the right shape", () => {
    expect(new Set(HOLDOUT.map((m) => m.id)).size).toBe(HOLDOUT.length);
    for (const m of HOLDOUT) expect(m.kind === "scam" ? m.min : m.max).toBeDefined();
    for (const id of Object.keys(KNOWN_MISSES)) expect(HOLDOUT.some((m) => m.id === id)).toBe(true);
  });

  for (const m of HOLDOUT) {
    const name = `${m.id} (${m.category}) ${m.kind === "scam" ? `>= ${m.min}` : `<= ${m.max}`}`;
    const test = () => expect(judge(m), m.text.slice(0, 80)).toSatisfy((l: Level) => ok(m, l));
    if (KNOWN_MISSES[m.id]) it.fails(`KNOWN MISS ${name}: ${KNOWN_MISSES[m.id]}`, test);
    else it(name, test);
  }

  afterAll(() => {
    process.stdout.write(`\nHeld-out detection: ${caught}/${scams.length} scams (${Math.round((100 * caught) / scams.length)}%). False alarms: ${alarms}/${genuine.length} genuine (${Math.round((100 * alarms) / genuine.length)}%).\n`);
  });
});
