// Fixture checks for header and raw mail parsing. All addresses are fictional.
import { describe, expect, it } from "vitest";
import { analyzeHeaders, parseRawMail } from "./headers";

const head = (auth: string, extra = "") => `Delivered-To: me@rishihood.edu.in
Authentication-Results: mx.google.com;
       ${auth}
From: "HR" <hr@acme.example>${extra}
Subject: Offer`;
const codes = (h: string) => analyzeHeaders(h).flags.map((f) => f.code);

describe("analyzeHeaders", () => {
  it("passes a fully authenticated mail", () => {
    const r = analyzeHeaders(head("spf=pass; dkim=pass; dmarc=pass"));
    expect(r.flags).toEqual([]);
    expect(r.from).toBe("hr@acme.example");
    expect(r.checks[0]).toMatchObject({ label: "Sender authentication", status: "pass" });
  });
  it("calls a DMARC failure high", () => {
    expect(analyzeHeaders(head("spf=pass; dkim=fail; dmarc=fail")).flags[0]).toMatchObject({ code: "AUTH_FAIL", level: "high" });
  });
  it("calls one failed check medium", () => {
    expect(analyzeHeaders(head("spf=softfail; dkim=pass; dmarc=pass")).flags[0]).toMatchObject({ code: "AUTH_WEAK", level: "medium" });
  });
  it("trusts only the top result, since lower ones can be forged", () => {
    const forged = `${head("spf=fail; dkim=fail; dmarc=fail")}\nAuthentication-Results: fake.example; spf=pass; dkim=pass; dmarc=pass`;
    expect(codes(forged)).toContain("AUTH_FAIL");
  });
  it("flags replies going somewhere else", () => {
    expect(codes(head("spf=pass; dkim=pass; dmarc=pass", "\nReply-To: <collect@other.example>"))).toEqual(["REPLY_TO_MISMATCH"]);
    expect(codes(head("spf=pass; dkim=pass; dmarc=pass", "\nReply-To: <jobs@mail.acme.example>"))).toEqual([]);
  });
  it("adds nothing when there are no results", () => {
    expect(analyzeHeaders("From: a@b.example").checks[0].status).toBe("skip");
  });
});

describe("parseRawMail", () => {
  const raw = [
    "From: hr@acme.example", 'Content-Type: multipart/mixed; boundary="b1"', "",
    "--b1", 'Content-Type: multipart/alternative; boundary="b2"', "",
    "--b2", "Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64", "",
    Buffer.from('<p>Share your OTP at <a href="https://evil.example/x">microsoft.com</a></p>').toString("base64"),
    "--b2--",
    "--b1", 'Content-Disposition: attachment; filename="offer.pdf.exe"', "Content-Type: application/octet-stream", "", "AAAA",
    "--b1--",
  ].join("\r\n");

  it("reads nested parts, decodes the body and finds links and attachments", () => {
    const m = parseRawMail(raw);
    expect(m.text).toContain("Share your OTP");
    expect(m.linkPairs).toEqual([{ href: "https://evil.example/x", text: "microsoft.com" }]);
    expect(m.attachments).toEqual(["offer.pdf.exe"]);
    expect(m.headers).toContain("From: hr@acme.example");
  });
  it("decodes quoted-printable", () => {
    expect(parseRawMail("Content-Type: text/plain\nContent-Transfer-Encoding: quoted-printable\n\nfee=20is=\n 500").text).toBe("fee is 500");
  });
  it("handles headers with no body", () => {
    expect(parseRawMail("From: a@b.example").text).toBe("");
  });
});
