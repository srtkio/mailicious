// Campus store with fetch stubbed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { campusVerdicts, dashboard, isSharedDomain, logEvent, reportTarget, setVerdict, topScripts } from "./store";

const json = (v: unknown) => new Response(JSON.stringify(v));

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "k");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("reportTarget", () => {
  it("judges one address on shared domains, and the whole domain otherwise", () => {
    expect(reportTarget("Fake.HR@gmail.com")).toBe("fake.hr@gmail.com");
    expect(reportTarget("student@rishihood.edu.in")).toBe("student@rishihood.edu.in");
    expect(reportTarget("student@nst.rishihood.edu.in")).toBe("student@nst.rishihood.edu.in");
    expect(isSharedDomain("rishihood.edu.in")).toBe(true);
    expect(isSharedDomain("fake.example")).toBe(false);
    expect(reportTarget("hr@mail.fake-jobs.co.in")).toBe("fake-jobs.co.in");
  });
  it("rejects anything that isn't an address", () => {
    for (const bad of ["", "nope", "a@b", "a b@c.example"]) expect(reportTarget(bad)).toBeNull();
  });
});

describe("topScripts", () => {
  const print = (n: number) => String(n).repeat(16);
  it("keeps only a fake sender's most-reported fingerprints", () => {
    const reports = [1, 1, 1, 2, 2, 3, 4].map((n) => ({ target: "bad.example", dna: print(n) }));
    expect(topScripts([...reports, { target: "ok.example", dna: print(5) }], ["bad.example"])).toEqual([print(1), print(2)]);
  });
});

describe("store", () => {
  it("never fails a check when Supabase is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    await expect(logEvent("low", null)).resolves.toBeUndefined();
    await expect(campusVerdicts()).resolves.toMatchObject({ fake: [], genuine: [] });
  });
  it("does nothing without keys", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await logEvent("low", null);
    expect(f).not.toHaveBeenCalled();
  });
  it("sees a new verdict at once", async () => {
    let rows = [{ target: "old.example", verdict: "fake" }, { target: "ok.example", verdict: "genuine" }];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("select=target") ? json(rows) : json([]))));
    await setVerdict("x.example", "genuine");
    expect(await campusVerdicts()).toMatchObject({ fake: ["old.example"], genuine: ["ok.example"] });
    rows = [{ target: "new.example", verdict: "fake" }];
    await setVerdict("new.example", "fake");
    expect((await campusVerdicts()).fake).toEqual(["new.example"]);
  });
  it("keeps a sender's verdicts when the script lookup fails, and only lists scripts of fake senders", async () => {
    const fail = { on: false };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("reports?")) {
        if (fail.on) throw new Error("down");
        return json([{ target: "bad.example", dna: "00ff00ff00ff00ff" }, { target: "ok.example", dna: "11ff00ff00ff00ff" }, { target: "bad.example", dna: "not-a-print" }]);
      }
      return json([{ target: "bad.example", verdict: "fake" }]);
    }));
    await setVerdict("bad.example", "fake");
    expect(await campusVerdicts()).toMatchObject({ fake: ["bad.example"], scripts: ["00ff00ff00ff00ff"] });
    fail.on = true;
    await setVerdict("bad.example", "fake");
    expect(await campusVerdicts()).toMatchObject({ fake: ["bad.example"], scripts: ["00ff00ff00ff00ff"] });
  });
  it("groups the queue and leaves out decided senders", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("events")) return json([{ level: "high", attack: "Fee" }, { level: "low", attack: null }, { level: "high", attack: "Fee" }]);
      if (url.includes("reports")) return json([{ target: "a.example", attack: "Fee", created_at: "t" }, { target: "a.example", attack: "Fee", created_at: "t" }, { target: "b.example", attack: null, created_at: "t" }]);
      return json([{ target: "b.example", verdict: "fake" }]);
    }));
    expect(await dashboard()).toMatchObject({ checked: 3, flagged: 2, attacks: [{ name: "Fee", count: 2 }], queue: [{ target: "a.example", count: 2 }] });
  });
});
