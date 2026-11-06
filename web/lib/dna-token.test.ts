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
  it("refuses anything else, and refuses everything without a key", () => {
    for (const bad of [undefined, null, 7, "", "zz", "ab".repeat(32)]) expect(dnaTokenOk(bad, dna, "fake.example")).toBe(false);
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(dnaToken(dna, "fake.example")).toBeNull();
    expect(dnaTokenOk("ab".repeat(32), dna, "fake.example")).toBe(false);
  });
});
