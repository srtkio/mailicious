// Third blind accuracy set, offline: the same rule steps as /api/check, minus AI, search and link fetching.
// Written blind to the engine and its fixes, committed before its first run, never edited after.
import { afterAll, describe, expect, it } from "vitest";
import { BLIND3 } from "@/fixtures/blind3";
import type { Mail } from "@/fixtures/mails";
import { checkRules, deepRules, findLinks } from "./engine";
import { analyzeHeaders } from "./headers";
import type { Level } from "./types";

const RANK: Record<Level, number> = { low: 0, medium: 1, high: 2 };

// Known misses, with the cause. it.fails keeps `npm test` green and goes red once one is fixed. Never edit the mail instead.
const KNOWN_MISSES: Record<string, string> = {
  "b-scam-1": "low: money mule ('receive client payments in your account and transfer them') isn't a rule; 'bank name' isn't bank details",
  "b-scam-2": "low: asking to install AnyDesk and share its address isn't a rule",
  "b-scam-3": "low: 'paying the processing charge of ₹590': singular 'charge' with the amount after it isn't read as a fee",
  "b-scam-4": "medium TOO_GOOD only: 'bear the visa stamping cost of Rs 38,000, payable to our agent' isn't read as a fee",
  "b-scam-7": "medium WRONG_DOMAIN only: 'reply with one of your Google backup codes' isn't read as a secret",
  "b-scam-11": "medium FREE_MAIL_CLAIM only: Hinglish '₹1,200 bhejna hoga' isn't read as a payment request",
};

function judge(m: Mail): Level {
  const headers = m.headers ? analyzeHeaders(m.headers) : null;
  const sender = m.sender || headers?.from || "";
  const links = [...new Set([...(m.linkPairs ?? []).map((l) => l.href), ...findLinks(m.text)])];
  const extra = [...(headers?.flags ?? []), ...deepRules({ sender, links, linkPairs: m.linkPairs, attachments: m.attachments })];
  return checkRules(m.text, sender, links, [], extra).level;
}
const ok = (m: Mail, level: Level) => (m.kind === "scam" ? RANK[level] >= RANK[m.min!] : RANK[level] <= RANK[m.max!]);

describe("third blind accuracy set", () => {
  const scams = BLIND3.filter((m) => m.kind === "scam");
  const genuine = BLIND3.filter((m) => m.kind === "genuine");
  const caught = scams.filter((m) => ok(m, judge(m))).length;
  const alarms = genuine.filter((m) => !ok(m, judge(m))).length;

  it("has the right shape", () => {
    expect(new Set(BLIND3.map((m) => m.id)).size).toBe(BLIND3.length);
    for (const m of BLIND3) expect(m.kind === "scam" ? m.min : m.max).toBeDefined();
    for (const id of Object.keys(KNOWN_MISSES)) expect(BLIND3.some((m) => m.id === id)).toBe(true);
  });

  for (const m of BLIND3) {
    const name = `${m.id} (${m.category}) ${m.kind === "scam" ? `>= ${m.min}` : `<= ${m.max}`}`;
    const test = () => expect(judge(m), m.text.slice(0, 80)).toSatisfy((l: Level) => ok(m, l));
    if (KNOWN_MISSES[m.id]) it.fails(`KNOWN MISS ${name}: ${KNOWN_MISSES[m.id]}`, test);
    else it(name, test);
  }

  afterAll(() => {
    process.stdout.write(`\nBlind set 3 detection: ${caught}/${scams.length} scams (${Math.round((100 * caught) / scams.length)}%). False alarms: ${alarms}/${genuine.length} genuine (${Math.round((100 * alarms) / genuine.length)}%).\n`);
  });
});
