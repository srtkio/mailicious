// Accuracy over the fixture set, offline: the same rule steps as /api/check, minus AI, search and link fetching.
import { afterAll, describe, expect, it } from "vitest";
import { MAILS, type Mail } from "@/fixtures/mails";
import { checkRules, deepRules, findLinks } from "./engine";
import { analyzeHeaders } from "./headers";
import type { Level } from "./types";

const RANK: Record<Level, number> = { low: 0, medium: 1, high: 2 };

// Known misses, with the cause. it.fails keeps `npm test` green and goes red once one is fixed, so move it out then.
const KNOWN_MISSES: Record<string, string> = {
  "otp-2": "low: SECRET only knows otp/verification code, not 'a code by SMS ... forward that code'",
  "fee-2": "low: no fee/deposit word, and 'transfer it' isn't followed by an amount ('costs INR 1999')",
  "fee-3": "low: 'amount of ₹899 must be cleared' has no fee word or pay+amount pair",
  "real-10": "high: 'placement fee ... included in your semester fees' reads as a fee request; only 'no fee' negation is known",
};

function judge(m: Mail): Level {
  const headers = m.headers ? analyzeHeaders(m.headers) : null;
  const sender = m.sender || headers?.from || "";
  const links = [...new Set([...(m.linkPairs ?? []).map((l) => l.href), ...findLinks(m.text)])];
  const extra = [...(headers?.flags ?? []), ...deepRules({ sender, links, linkPairs: m.linkPairs, attachments: m.attachments })];
  return checkRules(m.text, sender, links, [], extra).level;
}
const ok = (m: Mail, level: Level) => (m.kind === "scam" ? RANK[level] >= RANK[m.min!] : RANK[level] <= RANK[m.max!]);

describe("accuracy set", () => {
  const scams = MAILS.filter((m) => m.kind === "scam");
  const genuine = MAILS.filter((m) => m.kind === "genuine");
  const caught = scams.filter((m) => ok(m, judge(m))).length;
  const alarms = genuine.filter((m) => !ok(m, judge(m))).length;

  it("has the right shape", () => {
    expect(new Set(MAILS.map((m) => m.id)).size).toBe(MAILS.length);
    for (const m of MAILS) expect(m.kind === "scam" ? m.min : m.max).toBeDefined();
    for (const id of Object.keys(KNOWN_MISSES)) expect(MAILS.some((m) => m.id === id)).toBe(true);
  });

  for (const m of MAILS) {
    const name = `${m.id} (${m.category}) ${m.kind === "scam" ? `>= ${m.min}` : `<= ${m.max}`}`;
    const test = () => expect(judge(m), m.text.slice(0, 80)).toSatisfy((l: Level) => ok(m, l));
    if (KNOWN_MISSES[m.id]) it.fails(`KNOWN MISS ${name}: ${KNOWN_MISSES[m.id]}`, test);
    else it(name, test);
  }

  afterAll(() => {
    process.stdout.write(`\nDetection: ${caught}/${scams.length} scams (${Math.round((100 * caught) / scams.length)}%). False alarms: ${alarms}/${genuine.length} genuine (${Math.round((100 * alarms) / genuine.length)}%).\n`);
  });
});
