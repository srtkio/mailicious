// Rate limit behaviour, with the AI stubbed out.
import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/ai", () => ({
  extractClaims: vi.fn(async () => ({ company: null, role: null, signals: [] })),
  checkCompany: vi.fn(async () => null),
  signalFlags: () => [],
  MAX_MAIL: 8000,
}));
import { checkCompany, extractClaims } from "@/lib/ai";

const call = (ip: string, text = "Share the OTP now") =>
  POST(new Request("http://x/api/check", { method: "POST", headers: { "x-forwarded-for": ip }, body: JSON.stringify({ text }) }));

describe("AI time budget", () => {
  it("answers from the rules when the AI hangs", async () => {
    vi.useFakeTimers();
    vi.mocked(extractClaims).mockReturnValueOnce(new Promise(() => {}));
    const pending = call("3.3.3.3");
    await vi.advanceTimersByTimeAsync(15_000);
    const body = await (await pending).json();
    vi.useRealTimers();
    expect(body).toMatchObject({ level: "high", mode: "limited" });
    vi.mocked(extractClaims).mockClear();
  });
});

describe("college senders", () => {
  it("skips the company lookup for a proven college office", async () => {
    vi.mocked(checkCompany).mockClear();
    vi.mocked(extractClaims).mockResolvedValueOnce({ company: "Rishihood University", role: null, signals: [] });
    const headers = "Authentication-Results: mx; dmarc=pass header.from=rishihood.edu.in\r\nFrom: Council <learnercareercouncil@nst.rishihood.edu.in>";
    const res = await POST(new Request("http://x/api/check", { method: "POST", headers: { "x-forwarded-for": "9.9.9.9" }, body: JSON.stringify({ text: "Career session feedback for the internship drive.", headers }) }));
    const body = await res.json();
    expect(checkCompany).not.toHaveBeenCalled();
    expect(body.evidence.company).toBeNull();
    expect(body.mode).toBe("full");
    vi.mocked(extractClaims).mockClear();
  });
  it("still looks the company up for a personal college account", async () => {
    vi.mocked(checkCompany).mockClear();
    vi.mocked(extractClaims).mockResolvedValueOnce({ company: "Acme Corp", role: null, signals: [] });
    const headers = "Authentication-Results: mx; dmarc=pass header.from=rishihood.edu.in\r\nFrom: Student <manjistha.b@rishihood.edu.in>";
    await POST(new Request("http://x/api/check", { method: "POST", headers: { "x-forwarded-for": "9.9.9.8" }, body: JSON.stringify({ text: "Acme Corp internship, apply today.", headers }) }));
    expect(checkCompany).toHaveBeenCalled();
    vi.mocked(extractClaims).mockClear();
  });
});

describe("reply note", () => {
  const post = (text: string) => {
    const headers = "Authentication-Results: mx; dkim=pass; spf=pass; dmarc=pass header.from=school.in\r\nFrom: School <no-reply@school.in>\r\nReply-To: <help@school.co>";
    return POST(new Request("http://x/api/check", { method: "POST", headers: { "x-forwarded-for": "8.8.8.8" }, body: JSON.stringify({ text, headers }) })).then((r) => r.json());
  };
  it("stays a note unless the mail asks you to reply", async () => {
    const level = async (t: string) => (await post(t)).flags.find((f: { code: string }) => f.code === "REPLY_TO_MISMATCH")?.level;
    expect(await level("Your lecture is today at 5.")).toBe("low");
    expect(await level("Please reply to confirm your seat today.")).toBe("medium");
  });
});

describe("mode", () => {
  it("counts as a full check when the mail names no company to look up", async () => {
    expect((await (await call("4.4.4.4")).json()).mode).toBe("full");
    vi.mocked(extractClaims).mockClear();
  });
  it("is limited when the model hides a company the rules can see, and still looks it up", async () => {
    const body = await (await call("5.5.5.5", "Microsoft internship, share the OTP")).json();
    expect(vi.mocked(checkCompany).mock.calls.at(-1)![0].company).toBe("microsoft");
    expect(body.mode).toBe("limited");
    vi.mocked(extractClaims).mockClear();
  });
  it("skips the web search for mail that isn't about jobs", async () => {
    vi.mocked(checkCompany).mockClear();
    vi.mocked(extractClaims).mockResolvedValueOnce({ company: "Acme", role: null, signals: [] });
    expect((await (await call("7.7.7.7", "Your Acme order has shipped.")).json()).mode).toBe("full");
    expect(checkCompany).not.toHaveBeenCalled();
    vi.mocked(extractClaims).mockClear();
  });
  it("is limited when the model's company name was refused", async () => {
    vi.mocked(extractClaims).mockResolvedValueOnce({ company: null, role: null, signals: [], rejected: true });
    expect((await (await call("6.6.6.6")).json()).mode).toBe("limited");
    vi.mocked(extractClaims).mockClear();
  });
});

describe("AI rate limit", () => {
  it("stops calling the AI past the limit but still answers from the rules", async () => {
    for (let i = 0; i < 20; i++) await call("1.1.1.1");
    expect(extractClaims).toHaveBeenCalledTimes(20);
    const res = await call("1.1.1.1");
    expect(res.status).toBe(200);
    expect((await res.json()).level).toBe("high");
    expect(extractClaims).toHaveBeenCalledTimes(20);
    await call("2.2.2.2");
    expect(extractClaims).toHaveBeenCalledTimes(21);
  });
});
