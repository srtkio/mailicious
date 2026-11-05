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
  it("isn't fooled by results hidden in addresses, comments or quotes", () => {
    for (const auth of [
      "dmarc=fail smtp.mailfrom=dmarc=pass@evil.example; spf=fail; dkim=fail",
      'spf=fail (dmarc=pass) smtp.mailfrom="dmarc=pass"; dkim=fail; dmarc=fail',
      "spf=fail smtp.mailfrom=x; dkim=fail header.i=@dmarc=pass.example; dmarc=fail",
    ]) expect(codes(head(auth))).toContain("AUTH_FAIL");
  });
  it("counts a method as failed if any of its results failed", () => {
    expect(codes(head("spf=pass; dkim=pass; dkim=fail; dmarc=fail"))).toContain("AUTH_FAIL");
    expect(codes(head("spf=pass; dkim=pass; dmarc=fail; dmarc=none"))).toContain("AUTH_FAIL");
    expect(codes(head("spf=fail; spf=none; dkim=fail; dkim=temperror; dmarc=none"))).toContain("AUTH_FAIL");
  });
  it("isn't fooled by nested comments", () => {
    expect(codes(head("spf=fail (x (y) ; dmarc=pass) ; dkim=fail; dmarc=fail"))).toContain("AUTH_FAIL");
  });
  it("reads Outlook's format, which has no server name first", () => {
    const outlook = "From: a@b.example\nAuthentication-Results: dmarc=fail action=none header.from=b.example; spf=pass; dkim=none";
    expect(analyzeHeaders(outlook).flags[0].code).toBe("AUTH_FAIL");
  });
  it("ignores ARC results, which the sender can supply", () => {
    expect(analyzeHeaders("From: a@b.example\nARC-Authentication-Results: i=1; x; spf=pass; dkim=pass; dmarc=pass").checks[0].status).toBe("skip");
  });
  it("compares Indian domains properly and checks every reply address", () => {
    expect(codes(`${head("spf=pass; dkim=pass; dmarc=pass").replace("acme.example", "acme.co.in")}\nReply-To: <x@evil.co.in>`)).toEqual(["REPLY_TO_MISMATCH"]);
    expect(codes(head("spf=pass; dkim=pass; dmarc=pass", "\nReply-To: <a@acme.example>, <b@evil.example>"))).toEqual(["REPLY_TO_MISMATCH"]);
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

  it("reads nested parts, decodes the body and finds links and attachments", async () => {
    const m = await parseRawMail(raw);
    expect(m.text).toContain("Share your OTP");
    expect(m.linkPairs).toEqual([{ href: "https://evil.example/x", text: "microsoft.com" }]);
    expect(m.attachments).toEqual(["offer.pdf.exe"]);
    expect(m.headers).toContain("From: hr@acme.example");
  });
  it("decodes quoted-printable", async () => {
    expect((await parseRawMail("Content-Type: text/plain\nContent-Transfer-Encoding: quoted-printable\n\nfee=20is=\n 500")).text).toBe("fee is 500");
  });
  it("handles headers with no body", async () => {
    expect((await parseRawMail("From: a@b.example")).text).toBe("");
  });
  const html = (body: string) => `Content-Type: text/html; charset=utf-8\n\n${body}`;
  it("reads links however the HTML is written", async () => {
    const links = async (body: string) => (await parseRawMail(html(body))).linkPairs.map((l) => l.href);
    expect(await links("<A HREF=https://evil.example/a>x</A>")).toEqual(["https://evil.example/a"]);
    expect(await links('<a data-x="1>" href="https://evil.example/b">x</a>')).toEqual(["https://evil.example/b"]);
    expect(await links('<a href="https&#58;//evil.example/c">x</a>')).toEqual(["https://evil.example/c"]);
  });
  it("reads links the way a browser does", async () => {
    const links = async (body: string) => (await parseRawMail(html(body))).linkPairs.map((l) => l.href);
    expect(await links('<a href="\n  ht&#9;tps://evil.example/d">x</a>')).toEqual(["https://evil.example/d"]);
    expect(await links('<a href="//evil.example/e">x</a>')).toEqual(["https://evil.example/e"]);
    expect(await links('<base href="https://evil.example/"><a href="login">x</a>')).toEqual(["https://evil.example/login"]);
    expect(await links('<map><area href="https://evil.example/f" alt="map"></map>')).toEqual(["https://evil.example/f"]);
    expect(await links('<noscript><a href="https://evil.example/g">x</a></noscript>')).toEqual(["https://evil.example/g"]);
    expect(await links('<a href="/relative">x</a><a href="javascript:x()">y</a>')).toEqual([]);
  });
  it("scans both parts, so the HTML can't hide behind a clean plain part", async () => {
    const b = "b";
    const mail = [`Content-Type: multipart/alternative; boundary="${b}"`, "", `--${b}`, "Content-Type: text/plain", "", "Hello there", `--${b}`, "Content-Type: text/html", "", "<p>Share your OTP</p>", `--${b}--`].join("\r\n");
    const { text } = await parseRawMail(mail);
    expect(text).toContain("Hello there");
    expect(text).toContain("Share your OTP");
  });
  it("skips style and script text", async () => {
    expect((await parseRawMail(html("<style>p{}</style><script>x()</script><p>Hi</p>"))).text).toBe("Hi");
  });
  it("decodes encoded attachment names", async () => {
    const part = (head: string) => [`Content-Type: multipart/mixed; boundary="b"`, "", "--b", "Content-Type: text/plain", "", "hi", "--b", head, "", "AAAA", "--b--"].join("\r\n");
    expect((await parseRawMail(part("Content-Type: application/octet-stream\r\nContent-Disposition: attachment; filename*=UTF-8''offer%2Epdf%2Eexe"))).attachments).toEqual(["offer.pdf.exe"]);
    expect((await parseRawMail(part('Content-Type: application/octet-stream\r\nContent-Disposition: attachment; filename="=?UTF-8?B?b2ZmZXIuZXhl?="'))).attachments).toEqual(["offer.exe"]);
  });
  it("stays fast on hostile HTML", async () => {
    const start = Date.now();
    await parseRawMail(html("<a href=x>".repeat(50_000) + "<style>".repeat(50_000) + "<div>".repeat(50_000)));
    const nested = await parseRawMail(html("<a href=https://evil.example/><object>".repeat(50_000)));
    expect(nested.partial).toBe(true);
    expect(Date.now() - start).toBeLessThan(6000);
  });
  it("survives a huge flat page and says it couldn't read it all", async () => {
    expect((await parseRawMail(html("<p>x</p>".repeat(120_000)))).partial).toBe(true);
  });
});
