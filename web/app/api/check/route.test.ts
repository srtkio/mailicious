// Rate limit behaviour, with the AI stubbed out.
import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/ai", () => ({
  extractClaims: vi.fn(async () => ({ company: null, role: null, signals: [] })),
  checkCompany: vi.fn(async () => null),
  signalFlags: () => [],
}));
import { extractClaims } from "@/lib/ai";

const call = (ip: string) =>
  POST(new Request("http://x/api/check", { method: "POST", headers: { "x-forwarded-for": ip }, body: JSON.stringify({ text: "Share the OTP now" }) }));

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
