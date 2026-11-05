// Campus store with fetch stubbed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blockedTargets, dashboard, logEvent, reportTarget, setVerdict } from "./store";

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
    expect(reportTarget("hr@mail.fake-jobs.co.in")).toBe("fake-jobs.co.in");
  });
  it("rejects anything that isn't an address", () => {
    for (const bad of ["", "nope", "a@b", "a b@c.example"]) expect(reportTarget(bad)).toBeNull();
  });
});

describe("store", () => {
  it("never fails a check when Supabase is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    await expect(logEvent("low", null)).resolves.toBeUndefined();
    await expect(blockedTargets()).resolves.toEqual([]);
  });
  it("does nothing without keys", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await logEvent("low", null);
    expect(f).not.toHaveBeenCalled();
  });
  it("sees a new verdict at once", async () => {
    let rows = [{ target: "old.example" }];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("select=target") ? json(rows) : json([]))));
    await setVerdict("x.example", "genuine");
    expect(await blockedTargets()).toEqual(["old.example"]);
    rows = [{ target: "new.example" }];
    await setVerdict("new.example", "fake");
    expect(await blockedTargets()).toEqual(["new.example"]);
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
