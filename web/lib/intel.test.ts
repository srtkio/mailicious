// Threat intelligence with fetch stubbed, so nothing here uses the network.
import { afterEach, describe, expect, it, vi } from "vitest";
import { registrable } from "./engine";
import { threatIntel } from "./intel";

const json = (v: unknown) => new Response(JSON.stringify(v));
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

function stub({ age = 4000, mx = true, dmarc = true, sb = [] as string[], malicious = 0 } = {}) {
  const f = vi.fn(async (url: string) => {
    if (url.includes("rdap.org")) return json({ events: [{ eventAction: "registration", eventDate: daysAgo(age) }] });
    if (url.includes("_dmarc")) return json({ Answer: dmarc ? [{ data: "v=DMARC1; p=reject" }] : [] });
    if (url.includes("dns.google")) return json({ Answer: mx ? [{ data: "10 mx.example." }] : [] });
    if (url.includes("safebrowsing")) return json({ matches: sb.map((u) => ({ threat: { url: u } })) });
    if (url.includes("virustotal")) return json({ data: { attributes: { last_analysis_stats: { malicious } } } });
    return new Response("nope", { status: 404 });
  });
  vi.stubGlobal("fetch", f);
  return f;
}
const codes = (r: { flags: { code: string }[] }) => r.flags.map((f) => f.code);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("registrable", () => {
  it("handles Indian second-level domains", () => {
    expect(registrable("mail.acme.co.in")).toBe("acme.co.in");
    expect(registrable("mail.acme.com")).toBe("acme.com");
  });
});

describe("threatIntel", () => {
  it("flags a brand new domain as high and a young one as medium", async () => {
    stub({ age: 5 });
    expect((await threatIntel("hr@fresh.example", [])).flags[0]).toMatchObject({ code: "NEW_DOMAIN", level: "high" });
    stub({ age: 90 });
    expect((await threatIntel("hr@fresh.example", [])).flags[0]).toMatchObject({ code: "NEW_DOMAIN", level: "medium" });
  });
  it("passes an old domain with mail and DMARC set up", async () => {
    stub();
    const r = await threatIntel("hr@old.example", []);
    expect(r.flags).toEqual([]);
    expect(r.checks.filter((c) => c.label !== "Link reputation").every((c) => c.status === "pass")).toBe(true);
  });
  it("flags a domain with no mail server", async () => {
    stub({ mx: false });
    expect(codes(await threatIntel("hr@old.example", []))).toEqual(["NO_MAIL_SERVER"]);
  });
  it("doesn't look up free mail or known companies", async () => {
    const f = stub();
    await threatIntel("hr@gmail.com", []);
    await threatIntel("hr@careers.microsoft.com", []);
    expect(f).not.toHaveBeenCalled();
  });
  it("uses reputation services only with a key, and strips link queries", async () => {
    const f = stub();
    expect((await threatIntel("", ["https://evil.example/x?token=secret"])).checks[0].status).toBe("skip");
    expect(f).not.toHaveBeenCalled();
    vi.stubEnv("SAFE_BROWSING_API_KEY", "k");
    vi.stubEnv("VIRUSTOTAL_API_KEY", "k");
    const g = stub({ sb: ["https://evil.example/x"], malicious: 5 });
    const r = await threatIntel("", ["https://evil.example/x?token=secret"]);
    expect(codes(r)).toEqual(["KNOWN_MALICIOUS", "KNOWN_MALICIOUS"]);
    expect(JSON.stringify(g.mock.calls)).not.toContain("secret");
  });
  it("keeps results from other domains when one lookup fails, and says so", async () => {
    vi.stubEnv("VIRUSTOTAL_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("bad.example") ? json({ data: { attributes: { last_analysis_stats: { malicious: 5 } } } }) : new Response("nope", { status: 404 }))));
    expect(codes(await threatIntel("", ["https://new.example/", "https://bad.example/"]))).toEqual(["KNOWN_MALICIOUS"]);
    expect((await threatIntel("", ["https://new.example/", "https://fine.example/"])).checks[0].status).toBe("skip");
  });
  it("says when too many domains stop it checking them all", async () => {
    vi.stubEnv("VIRUSTOTAL_API_KEY", "k");
    stub();
    const r = await threatIntel("", ["a", "b", "c", "d"].map((d) => `https://${d}.example/`));
    expect(codes(r)).toEqual(["LINK_NOT_CHECKED"]);
    expect(r.checks[0].status).toBe("warn");
  });
  it("shows lookups that failed as skipped and adds no flags", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    const r = await threatIntel("hr@old.example", []);
    expect(r.flags).toEqual([]);
    expect(r.checks[0]).toMatchObject({ label: "Domain age", status: "skip" });
  });
});
