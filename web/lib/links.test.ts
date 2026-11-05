// Link/form checks with fetch stubbed, so nothing here touches the network. All forms are fictional.
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRules } from "./engine";
import { checkLinks, formFlags, parseGoogleForm } from "./links";

const page = (title: string, questions: string[]) =>
  `<html><title>${title}</title><script>var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify([null, ["", questions.map((q, i) => [i, q])]])};</script>
   <footer>Never submit passwords through Google Forms.</footer></html>`;
const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });
const FORM = "https://docs.google.com/forms/d/e/abc/viewform";

function stub(routes: Record<string, () => Response>) {
  const f = vi.fn(async (url: URL) => routes[url.href]?.() ?? new Response("nope", { status: 404 }));
  vi.stubGlobal("fetch", f);
  return f;
}
const codes = (flags: { code: string }[]) => flags.map((f) => f.code);

afterEach(() => vi.unstubAllGlobals());

describe("parseGoogleForm", () => {
  it("reads the title and questions but not the page footer", () => {
    const form = parseGoogleForm(page("Microsoft Internship", ["Your name", "Your branch"]))!;
    expect(form.title).toBe("Microsoft Internship");
    expect(form.text).toContain("Your branch");
    expect(form.text).not.toContain("passwords");
  });
  it("decodes the title, since the card shows it as plain text", () => {
    expect(parseGoogleForm(page("Part1&amp;Part2 &#39;26", []))!.title).toBe("Part1&Part2 '26");
  });
  it("returns null for pages without form data or with broken data", () => {
    expect(parseGoogleForm("<html>sign in</html>")).toBeNull();
    expect(parseGoogleForm("<script>FB_PUBLIC_LOAD_DATA_ = [oops;</script>")).toBeNull();
  });
});

describe("formFlags", () => {
  it("flags sensitive fields as high", () => {
    for (const q of ["Enter the OTP", "Bank account number", "Aadhaar number", "UTR / Transaction ID"])
      expect(formFlags({ title: "Form", text: q })[0]).toMatchObject({ code: "FORM_ASKS_DATA", level: "high" });
  });
  it("flags a form that doesn't match the claimed company", () => {
    expect(codes(formFlags({ title: "KYC verification", text: "KYC verification\nName" }, "microsoft"))).toEqual(["FORM_MISMATCH"]);
  });
  it("doesn't let a tiny company name settle the mismatch check either way", () => {
    expect(formFlags({ title: "KYC", text: "KYC\nName" }, "EY")).toEqual([]);
  });
  it("leaves a harmless matching form alone", () => {
    expect(formFlags({ title: "Microsoft Internship", text: "Microsoft Internship\nName\nBranch" }, "microsoft")).toEqual([]);
  });
});

describe("checkLinks", () => {
  it("follows forms.gle to the form, and the form's flag sets the final level", async () => {
    stub({
      "https://forms.gle/abc": () => redirect(FORM),
      [FORM]: () => new Response(page("KYC verification", ["Bank account number"])),
    });
    const text = "Microsoft internship. Fill forms.gle/abc today.";
    const extra = await checkLinks(text);
    expect(codes(extra)).toEqual(["FORM_ASKS_DATA", "FORM_MISMATCH"]);
    const r = checkRules(text, "", [], [], extra);
    expect(r.level).toBe("high");
    expect(r.evidence.link).toContain("KYC verification");
  });

  it("reports where a short link goes without connecting to the destination", async () => {
    const f = stub({ "https://bit.ly/x": () => redirect("https://micr0soft-jobs.example/track?id=1") });
    const flags = await checkLinks("See https://bit.ly/x");
    expect(flags[0]).toMatchObject({ code: "SHORT_LINK_TARGET", level: "medium" });
    expect(flags[0].text).toContain("micr0soft-jobs.example");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("flags a short link that lands on a private or bare IP, without connecting to it", async () => {
    const f = stub({ "https://bit.ly/x": () => redirect("http://169.254.169.254/latest/meta-data/") });
    expect(codes(await checkLinks("https://bit.ly/x"))).toEqual(["RAW_IP_LINK"]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("never connects to hosts off the list", async () => {
    const f = stub({});
    const urls = ["https://evil.example/", "http://127.0.0.1/", "https://bit.ly@evil.example/", "https://bit.ly:8080/x", "https://docs.google.com/document/d/1"];
    expect(await checkLinks("", urls)).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it("flags redirect loops instead of passing them silently", async () => {
    const f = stub({ "https://bit.ly/a": () => redirect("https://bit.ly/a") });
    expect(codes(await checkLinks("https://bit.ly/a"))).toEqual(["LINK_NOT_CHECKED"]);
    expect(f).toHaveBeenCalledTimes(4);
  });

  it("adds nothing when the network fails or the page is too big", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await checkLinks("forms.gle/abc")).toEqual([]);
    stub({ [FORM]: () => new Response("x".repeat(2_000_001)) });
    expect(await checkLinks("", [FORM])).toEqual([]);
  });

  it("caps how many links one request can fetch", async () => {
    const f = stub({});
    const flags = await checkLinks("", Array.from({ length: 20 }, (_, i) => `https://bit.ly/${i}`));
    expect(f).toHaveBeenCalledTimes(5);
    expect(flags).toMatchObject([{ code: "LINK_NOT_CHECKED", level: "medium" }]);
  });

  it("checks forms first, so decoy short links can't hide one", async () => {
    stub({ "https://forms.gle/bad": () => redirect(FORM), [FORM]: () => new Response(page("KYC", ["Bank account number"])) });
    const decoys = Array.from({ length: 6 }, (_, i) => `https://bit.ly/${i}`);
    expect(codes(await checkLinks("", [...decoys, "https://forms.gle/bad"]))).toContain("FORM_ASKS_DATA");
  });

  it("reads every form URL shape through viewform, so none can submit", async () => {
    const shapes = ["formResponse?entry.1=x&submit=Submit", "edit", "closedform", "viewform/", "viewform?entry.1=x"];
    for (const shape of shapes) {
      const f = stub({ [FORM]: () => new Response(page("KYC", ["Bank account number"])) });
      expect(codes(await checkLinks("", [`https://docs.google.com/forms/u/0/d/e/abc/${shape}`]))).toEqual(["FORM_ASKS_DATA"]);
      expect(f.mock.calls.map(([u]) => u.href)).toEqual([FORM]);
    }
  });

  it("follows a short link into a form submission as viewform", async () => {
    const f = stub({ "https://bit.ly/x": () => redirect("https://docs.google.com/forms/d/e/abc/formResponse?submit=Submit"), [FORM]: () => new Response(page("Form", [])) });
    await checkLinks("https://bit.ly/x");
    expect(f.mock.calls.map(([u]) => u.href)).toEqual(["https://bit.ly/x", FORM]);
  });

  it("flags a form URL it can't read instead of dropping it", async () => {
    const f = stub({});
    expect(codes(await checkLinks("", ["https://docs.google.com/forms/about/"]))).toEqual(["LINK_NOT_CHECKED"]);
    expect(f).not.toHaveBeenCalled();
  });

  it("counts query and hash variants of a link once", async () => {
    stub({ "https://forms.gle/bad": () => redirect(FORM), [FORM]: () => new Response(page("KYC", ["Bank account number"])) });
    const variants = Array.from({ length: 8 }, (_, i) => `https://bit.ly/x?${i}#${i}`);
    const flags = codes(await checkLinks("", [...variants, "https://forms.gle/bad"]));
    expect(flags).toContain("FORM_ASKS_DATA");
    expect(flags).not.toContain("LINK_NOT_CHECKED");
  });
});
