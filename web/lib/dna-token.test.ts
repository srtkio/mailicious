import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dnaToken, dnaTokenOk } from "./dna-token";

beforeEach(() => vi.stubEnv("SUPABASE_SECRET_KEY", "k"));
afterEach(() => vi.unstubAllEnvs());

describe("dnaToken", () => {
  const dna = "00ff00ff00ff00ff";
  it("accepts its own token", () => {
    expect(dnaTokenOk(dnaToken(dna, "fake.example"), dna, "fake.example")).toBe(true);
  });
  it("binds the fingerprint to its sender", () => {
    const token = dnaToken(dna, "fake.example");
    expect(dnaTokenOk(token, "11ff00ff00ff00ff", "fake.example")).toBe(false);
    expect(dnaTokenOk(token, dna, "other.example")).toBe(false);
  });
  it("expires after a day", () => {
    const now = 1_790_000_000_000;
    const token = dnaToken(dna, "fake.example", now);
    expect(dnaTokenOk(token, dna, "fake.example", now + 3_600_000)).toBe(true);
    expect(dnaTokenOk(token, dna, "fake.example", now + 90_000_000)).toBe(false);
    expect(dnaTokenOk(token, dna, "fake.example", now - 3_600_000)).toBe(false);
  });
  it("refuses a changed time", () => {
    const token = dnaToken(dna, "fake.example", 1_790_000_000_000)!;
    expect(dnaTokenOk(token.replace("1790000000000", "1790000000001"), dna, "fake.example", 1_790_000_000_000)).toBe(false);
  });
  it("refuses anything else, and refuses everything without a key", () => {
    for (const bad of [undefined, null, 7, "", "zz", `1790000000000.${"ab".repeat(32)}`]) expect(dnaTokenOk(bad, dna, "fake.example")).toBe(false);
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(dnaToken(dna, "fake.example")).toBeNull();
  });
});
