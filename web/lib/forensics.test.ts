import { describe, expect, it } from "vitest";
import { activeContent, auditLetter, letterDate, pdfDate, validCin, validGstin, type PdfFacts } from "./forensics";

const facts = (over: Partial<PdfFacts>): PdfFacts => ({ text: "", pages: 1, active: [], ...over });
const status = (r: ReturnType<typeof auditLetter>, label: string) => r.findings.find((f) => f.label === label)?.status;

describe("company numbers", () => {
  it("checks the GSTIN check digit", () => {
    expect(validGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(validGstin("27AAPFU0939F1ZX")).toBe(false);
    expect(validGstin("99AAPFU0939F1Z")).toBe(false);
    expect(validGstin("50AAPFU0939F1ZV")).toBe(false);
  });
  it("reads a CIN's structure", () => {
    expect(validCin("U72200KA2015PTC123456", 2026)).toBe(true);
    expect(validCin("U72200ZZ2015PTC123456", 2026)).toBe(false);
    expect(validCin("U72200KA2099PTC123456", 2026)).toBe(false);
    expect(validCin("U72200KA2015XYZ123456", 2026)).toBe(false);
  });
});

describe("dates", () => {
  it("reads both PDF and letter dates", () => {
    expect(pdfDate("D:20260312101500+05'30'")?.toISOString().slice(0, 10)).toBe("2026-03-12");
    expect(pdfDate(undefined)).toBeNull();
    expect(letterDate("Date: 12th March 2026")?.toISOString().slice(0, 10)).toBe("2026-03-12");
    expect(letterDate("Dated 05/11/2026")?.toISOString().slice(0, 10)).toBe("2026-11-05");
    expect(letterDate("no date here")).toBeNull();
  });
});

describe("auditLetter", () => {
  const clean = "Date: 12 March 2026. Offer of employment from Northwind Technologies Private Limited. CIN U72200KA2015PTC123456. GSTIN 27AAPFU0939F1ZV. Contact careers@northwind.example.";
  it("clears a clean letter", () => {
    const r = auditLetter(facts({ text: clean, producer: "Microsoft Word", created: new Date(Date.UTC(2026, 2, 12)) }));
    expect(r.level).toBe("low");
    expect(r.findings.every((f) => f.status === "pass")).toBe(true);
  });
  it("fails a made-up GSTIN", () => {
    const r = auditLetter(facts({ text: clean.replace("27AAPFU0939F1ZV", "27AAPFU0939F1ZX") }));
    expect(r.level).toBe("high");
    expect(status(r, "GST number")).toBe("fail");
  });
  it("fails a request for money, by UPI or in words", () => {
    expect(status(auditLetter(facts({ text: `${clean} Pay to hr.desk@ybl today.` })), "Payment details")).toBe("fail");
    expect(status(auditLetter(facts({ text: `${clean} A refundable security deposit applies.` })), "Payment details")).toBe("fail");
  });
  it("doesn't call a salary a payment demand", () => {
    expect(status(auditLetter(facts({ text: `${clean} Your monthly salary will be Rs 45,000.` })), "Payment details")).toBe("pass");
  });
  it("warns on design tools, stale dates, free mail and a missing CIN", () => {
    const r = auditLetter(facts({ text: "Date: 12 March 2026. Offer letter. Contact hr.desk@gmail.com", producer: "Canva", created: new Date(Date.UTC(2026, 5, 1)) }));
    expect(r.level).toBe("medium");
    for (const label of ["How it was made", "Dates", "Contact address", "Company number"]) expect(status(r, label)).toBe("warn");
  });
  it("says so when the letter is only a picture", () => {
    expect(status(auditLetter(facts({ producer: "Word" })), "Readable text")).toBe("warn");
  });
  it("can't be cleared by padding the demand past what's read", () => {
    const r = auditLetter(facts({ text: `${clean} ${"word ".repeat(50_000)} Pay to hr.desk@ybl today.`, producer: "Microsoft Word", created: new Date(Date.UTC(2026, 2, 12)) }));
    expect(r.level).toBe("medium");
    expect(status(r, "Readable text")).toBe("warn");
  });
  it("fails active content and puts the worst first", () => {
    const r = auditLetter(facts({ text: clean, active: ["a script"] }));
    expect(r.level).toBe("high");
    expect(r.findings[0].label).toBe("Hidden actions");
  });
});

describe("activeContent", () => {
  it("finds scripts and launch actions in the raw file", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7 /OpenAction << /S /JavaScript /JS (app.alert(1)) >> /Launch");
    expect(activeContent(pdf)).toEqual(["a script", "a launch action"]);
    expect(activeContent(new TextEncoder().encode("%PDF-1.7 plain"))).toEqual([]);
  });
});
