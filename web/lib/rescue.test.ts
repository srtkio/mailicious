import { describe, expect, it } from "vitest";
import { complaint, rescuePlan } from "./rescue";

describe("rescuePlan", () => {
  it("is empty until the student says what happened", () => {
    expect(rescuePlan([])).toEqual([]);
  });
  it("puts calling 1930 first when money moved", () => {
    expect(rescuePlan(["money"])[0].title).toBe("Call 1930");
  });
  it("keeps the most urgent steps on top across several slips", () => {
    const order = rescuePlan(["id", "money"]).map((s) => s.when);
    expect(order.indexOf("Today")).toBeGreaterThan(order.lastIndexOf("Right now"));
  });
  it("never repeats a step", () => {
    const titles = rescuePlan(["money", "id"]).map((s) => s.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe("complaint", () => {
  const when = new Date(Date.UTC(2026, 10, 6, 12));
  it("holds only what the student gave", () => {
    const text = complaint(["money"], { sender: "hr@fake.example", attack: "Advance-fee scam", amount: "Rs 1500", reference: "UTR123", when });
    for (const part of ["hr@fake.example", "Advance-fee scam", "Rs 1500", "UTR123", "paid money"]) expect(text).toContain(part);
    expect(complaint(["link"], { when })).not.toContain("Amount lost");
  });
  it("reads as a sentence", () => {
    expect(complaint(["link"], { when })).toContain("What happened: I clicked a link.");
  });
});
