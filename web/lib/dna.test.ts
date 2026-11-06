import { describe, expect, it } from "vitest";
import { BLIND3 } from "@/fixtures/blind3";
import { HOLDOUT } from "@/fixtures/holdout";
import { MAILS } from "@/fixtures/mails";
import { dnaDistance, dnaMatch, isDna, SAME_SCRIPT_BITS, scamDna } from "./dna";

const SCAM =
  "Congratulations! You have been selected for the Microsoft summer internship 2026 at our Bangalore office. No interview is needed and your profile has been shortlisted by our senior recruitment team. Pay the refundable registration fee of Rs 1500 to our finance desk and share the OTP sent to your phone within 2 hours to confirm your seat. After confirmation you will receive your offer letter and joining kit. Failure to respond will cancel your selection.";
const SWAPPED = SCAM.replace(/Microsoft/g, "Infosys").replace("Rs 1500", "Rs 2200").replace("Bangalore", "Pune").replace("2 hours", "3 hours");
const REWORDED = SWAPPED.replace("Congratulations!", "Greetings candidate,").replace("finance desk", "accounts team").replace("senior recruitment team", "talent acquisition group").replace("joining kit", "induction pack");

describe("scamDna", () => {
  it("is stable, and short mails get none", () => {
    expect(scamDna(SCAM)).toBe(scamDna(SCAM));
    expect(isDna(scamDna(SCAM))).toBe(true);
    expect(scamDna("Your interview is at 10am on Monday.")).toBeNull();
  });
  it("ignores swapped links and addresses", () => {
    expect(scamDna(`${SCAM} Visit https://a.example/x or mail hr@a.example`)).toBe(scamDna(`${SCAM} Visit https://b.example/y or mail jobs@b.example`));
  });
  it("still knows a script after its names, amounts and wording change", () => {
    const dna = scamDna(SCAM);
    expect(dnaMatch(scamDna(SWAPPED), [dna!])).not.toBeNull();
    expect(dnaMatch(scamDna(REWORDED), [dna!])).not.toBeNull();
  });
  it("never joins two unrelated test mails", () => {
    const seen = [...new Set([...MAILS, ...HOLDOUT, ...BLIND3].map((m) => m.text))].map(scamDna).filter((d): d is string => !!d);
    expect(seen.length).toBeGreaterThan(60);
    for (let i = 0; i < seen.length; i++) for (let j = i + 1; j < seen.length; j++) expect(dnaDistance(seen[i], seen[j])).toBeGreaterThan(SAME_SCRIPT_BITS);
  });
  it("rejects nothing it can't compare", () => {
    expect(dnaMatch(null, ["00000000ffffffff"])).toBeNull();
    expect(dnaMatch("00000000ffffffff", [])).toBeNull();
    expect(isDna("nothex")).toBe(false);
  });
});
