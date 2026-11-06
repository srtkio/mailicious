// Runs inside Gmail. Checks every mail the student opens while the switch is on, and shows the result on the mail.
// Only the open mail's text, sender, links and headers leave the browser.
(() => {
  if (window.__mailicious) return;
  window.__mailicious = true;

  // Only for the inbox dot, which is judged on the row alone. Opened mails are always checked.
  const PLACEMENT = /\b(offer letter|job offer|internship|intern|placement|hiring|recruit\w*|job opening|job opportunity|selected for|shortlisted|interview|stipend|salary|ctc|career\w*)\b/i;
  const RISKY = /\b(otp|registration fee|processing fee|security deposit|aadhaa?r|pan card|bank details|whatsapp|telegram)\b/i;
  const FREE_MAIL = /@(gmail|yahoo|outlook|hotmail|rediffmail)\.[a-z.]+$/i;
  const PRIVATE_DATA = [
    [/\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/, "a card number"], // before Aadhaar, whose 12 digits a card also contains
    [/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/, "an Aadhaar number"],
    [/\b[A-Z]{5}\d{4}[A-Z]\b/, "a PAN number"],
  ];
  const STYLE = {
    high: { label: "Likely fake", color: "#c81e1e", tint: "#fbeaec" },
    medium: { label: "Check first", color: "#a15c00", tint: "#fbf2e3" },
    low: { label: "No red flags", color: "#15803d", tint: "#e8f3ec" },
  };
  const CSS = `
    :host { all: initial; display: block; font: 14px/1.45 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #0b0b0b; }
    .card { border-left: 4px solid var(--c); background: var(--t); padding: 12px 14px; margin: 8px 0 12px; border-radius: 4px; }
    .top { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
    .label { font-weight: 800; font-size: 16px; color: var(--c); }
    .attack { color: #57534e; }
    ul { margin: 6px 0; padding-left: 18px; }
    .next { font-weight: 700; margin: 6px 0 0; }
    .hint { color: #57534e; font-size: 12px; margin: 8px 0 0; }
    details { margin-top: 8px; }
    summary { cursor: pointer; color: #c2410c; }
    .row { display: grid; grid-template-columns: 16px 1fr; gap: 6px; margin-top: 4px; }
    a { color: #c2410c; }
    .pill { display: inline-block; color: var(--c); font-size: 12px; margin: 4px 0; }
    details { font-size: 13px; margin-bottom: 8px; }
    .overlay { position: fixed; inset: 0; z-index: 2147483647; background: rgba(0, 0, 0, .6); display: grid; place-items: center; padding: 16px; }
    .box { background: #fff; max-width: 420px; padding: 20px; border-radius: 6px; }
    .box h2 { margin: 0 0 8px; font-size: 18px; color: #c81e1e; }
    .box code { word-break: break-all; }
    .actions { display: flex; gap: 10px; margin-top: 14px; }
    button { font: inherit; padding: 8px 14px; border: 1px solid #c2410c; background: #fff; color: #c2410c; border-radius: 4px; cursor: pointer; }
    button.main { background: #ff6a00; border-color: #0a0a0a; color: #0a0a0a; }
    button.report { margin-top: 8px; padding: 5px 10px; }
    button:focus-visible, summary:focus-visible, a:focus-visible { outline: 3px solid #c2410c; outline-offset: 2px; }
    .toast { position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; max-width: 340px; background: #c81e1e; color: #fff; padding: 12px 14px; border-radius: 6px; box-shadow: 0 10px 28px rgba(0, 0, 0, .3); animation: toast-in .3s cubic-bezier(.2, .9, .3, 1.15) both; }
    .card { position: relative; overflow: hidden; animation: card-in .34s cubic-bezier(.2, .8, .2, 1) both; }
    .card::after { content: ""; position: absolute; inset: 0; background: linear-gradient(105deg, transparent 40%, rgba(255, 255, 255, .7) 50%, transparent 60%); transform: translateX(-100%); animation: sweep .8s ease-out .15s 1; pointer-events: none; }
    .pill { animation: pill-in .3s ease-out both; }
    .pill.busy { background: linear-gradient(90deg, #a15c00 42%, #ff6a00 50%, #a15c00 58%) 0 0 / 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: shimmer 1.3s linear infinite; }
    .overlay { animation: fade .18s ease-out both; }
    .box { box-shadow: 0 24px 60px rgba(0, 0, 0, .4); animation: pop .28s cubic-bezier(.2, 1.3, .4, 1) both; }
    @keyframes card-in { from { opacity: 0; transform: translateY(-6px); } }
    @keyframes pill-in { from { opacity: 0; transform: translateX(-6px); } }
    @keyframes sweep { to { transform: translateX(100%); } }
    @keyframes shimmer { from { background-position: 100% 0; } to { background-position: 0 0; } }
    @keyframes fade { from { opacity: 0; } }
    @keyframes pop { from { opacity: 0; transform: scale(.92) translateY(10px); } }
    @keyframes toast-in { from { opacity: 0; transform: translateY(14px); } }
    @media (prefers-reduced-motion: reduce) {
      .card, .card::after, .pill, .overlay, .box, .toast { animation: none; }
      .card::after { display: none; }
      .pill.busy { background: none; color: var(--c); animation: none; }
    }
  `;
    // Selectors as gmail.js and InboxSDK use them; the second of each pair is InboxSDK's fallback.
  const bodyOf = (message) => message.querySelector(".a3s") ?? message.querySelector(".ii.gt");

  const results = new Map(); // message id -> result, or "pending"
  const attempts = new Map(); // message id -> failed tries
  const MAX_TRIES = 3;
  const SEVERITY = { low: 0, medium: 1, high: 2 };
  const CHECK_TIMEOUT_MS = 28000;
  const FAILED_TEXT = "MAILicious couldn't check this mail. Refresh Gmail to try again, and be careful until then.";
  let latest = null;
  let badge = ""; // what the toolbar badge currently describes

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text; // always text: mail content comes from scammers
    return node;
  };
  function shadowHost(id) {
    const host = document.createElement("div");
    host.dataset.mailicious = id;
    const root = host.attachShadow({ mode: "open" });
    root.append(el("style", "", CSS));
    return { host, root };
  }

  function card(result, id) {
    const { host, root } = shadowHost(id);
    const style = STYLE[result.level];
    host.style.setProperty("--c", style.color);
    host.style.setProperty("--t", style.tint);
    const hint = "Full report: click the MAILicious icon in your toolbar.";
    if (result.level === "low") {
      const prefix = result.mode === "limited" ? "MAILicious did a basic check:" : "✓ MAILicious:";
      root.append(el("span", "pill", `${prefix} ${result.reasons[0]} ${hint}`));
      return host;
    }
    const box = el("div", "card");
    const top = el("div", "top");
    top.append(el("span", "label", style.label));
    if (result.attack) top.append(el("span", "attack", result.attack));
    const list = el("ul");
    result.reasons.slice(0, 2).forEach((r) => list.append(el("li", "", r)));
    box.append(top, list, el("p", "next", result.nextStep));
    if (result.sender) box.append(reportButton(result));
    box.append(el("p", "hint", hint));
    root.append(box);
    return host;
  }

  function reportButton(result) {
    const button = el("button", "report", "Report this sender");
    button.onclick = () => {
      button.disabled = true;
      button.textContent = "Reporting…";
      chrome.runtime.sendMessage({ type: "report", payload: { sender: result.sender, level: result.level, attack: result.attack, dna: result.dna, dnaToken: result.dnaToken } }, (ok) => {
        button.textContent = !chrome.runtime.lastError && ok ? "Reported to your placement cell" : "Report failed, try again";
        button.disabled = !chrome.runtime.lastError && ok;
      });
    };
    return button;
  }

  function linkWarning(url, unchecked, go) {
    const { host, root } = shadowHost("warning");
    const overlay = el("div", "overlay");
    const box = el("div", "box");
    box.append(
      el("h2", "", unchecked ? "Wait. This mail wasn't checked." : "Wait. This mail looks fake."),
      el("p", "", unchecked ? "MAILicious couldn't check this mail, so be sure you trust the sender." : "This link came from a mail MAILicious flagged. It may steal your details."),
      el("code", "", url),
    );
    const actions = el("div", "actions");
    const back = el("button", "main", "Stay safe");
    const open = el("button", "", "Open anyway");
    back.onclick = () => host.remove();
    open.onclick = () => (host.remove(), go());
    actions.append(back, open);
    box.append(actions);
    overlay.append(box);
    root.append(overlay);
    document.body.append(host);
    back.focus();
  }

  function toast(message) {
    document.querySelector('[data-mailicious="toast"]')?.remove(); // the newest warning is the most specific
    const { host, root } = shadowHost("toast");
    root.append(el("div", "toast", message));
    document.body.append(host);
    setTimeout(() => host.remove(), 7000);
  }

  const decodeEntities = (html) =>
    html
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");

  // Gmail's own "Show original" page holds the real headers. Same origin, so no extra login or permission.
  async function fetchHeaders(id, legacyId) {
    const account = location.pathname.match(/\/mail\/u\/\d+/)?.[0] ?? "/mail/u/0";
    const ik = [...document.scripts].map((s) => s.textContent.match(/GLOBALS=\[(?:[^,]*,){9}"([0-9a-f]{6,})"/)?.[1]).find(Boolean);
    const ref = legacyId ? `th=${legacyId}` : `permmsgid=${id}`;
    try {
      const res = await fetch(`${location.origin}${account}/?${ik ? `ik=${ik}&` : ""}view=om&${ref}`, { credentials: "same-origin", signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      // Read as text: Gmail enforces Trusted Types, which can block DOMParser on a string.
      const raw = decodeEntities((await res.text()).match(/<pre[^>]*id="raw_message_text"[^>]*>([\s\S]*?)<\/pre>/)?.[1] ?? "");
      const end = raw.search(/\r?\n\r?\n/);
      return /Authentication-Results|Received:/i.test(raw) && end > 0 ? raw.slice(0, Math.min(end, 60000)) : null; // headers only, never the body twice
    } catch {
      return null;
    }
  }

  async function checkMessage(message) {
    const id = (message.dataset.messageId ?? "").replace(/^#/, "");
    const body = bodyOf(message);
    if (!id || !body || results.has(id)) return;
    const text = body.innerText.trim();
    const subject = document.querySelector("h2.hP, .ha h2")?.textContent ?? "";
    // Image-only mails have no body text, but their subject and links still get checked.
    if (!text && !subject && !body.querySelector("a[href]")) return results.set(id, null);

    results.set(id, "pending");
    showStatus(message, id, "MAILicious is checking this mail…", true);
    syncToolbar();
    const sender = message.querySelector(".gD[email], td.gF span[email]")?.getAttribute("email") ?? "";
    const anchors = [...body.querySelectorAll("a[href]")].filter((a) => /^https?:/i.test(a.href)).slice(0, 40);
    const linkPairs = anchors.map((a) => ({ text: a.textContent.trim().slice(0, 300), href: a.href.slice(0, 2000) }));
    const attachments = [...message.querySelectorAll(".aV3")].map((n) => n.textContent.trim().slice(0, 200)).filter(Boolean).slice(0, 20);
    const headers = await fetchHeaders(id, message.dataset.legacyMessageId);

    // The time limit means a stuck check becomes a retry, so "checking" can never hang forever.
    const result = await new Promise((done) => {
      setTimeout(() => done(null), CHECK_TIMEOUT_MS);
      try {
        chrome.runtime.sendMessage({ type: "check", payload: { text: `${subject}\n${text}`.trim().slice(0, 20000) || "(no text)", sender, linkPairs, attachments, unreadBody: !text, ...(headers ? { headers } : {}) } }, (r) => done(chrome.runtime.lastError ? null : r));
      } catch {
        done(null); // the extension was reloaded under this page
      }
    });
    if (result?.off) {
      clearStatus(message);
      results.set(id, null); // the student switched it off: stay silent
      return syncToolbar();
    }
    if (!result) return retry(message, id);
    attempts.delete(id);
    results.set(id, result);
    latest = result;
    show(message, id, result);
    syncToolbar();
  }

  // A failed check must never look like an all-clear, so retry, then say so on the mail.
  function retry(message, id) {
    const tries = (attempts.get(id) ?? 0) + 1;
    attempts.set(id, tries);
    if (tries < MAX_TRIES) {
      results.delete(id);
      setTimeout(schedule, 2000 * tries);
      return;
    }
    results.set(id, { failed: true });
    latest = { failed: true }; // keeps the OTP warning on for replies to it
    showStatus(message, id, FAILED_TEXT);
    syncToolbar();
  }

  function clearStatus(message) {
    message.querySelector('[data-mailicious="status"]')?.remove();
  }

  function showStatus(message, id, text, busy = false) {
    clearStatus(message);
    const { host, root } = shadowHost("status");
    host.style.setProperty("--c", "#a15c00");
    root.append(el("span", busy ? "pill busy" : "pill", text));
    (bodyOf(message)?.parentElement ?? message).prepend(host);
  }

  const toolbarReport = ({ level, attack, reasons, nextStep, checks, mode, sender, evidence, sources, dna, dnaMatch, dnaToken }) => ({ level, attack, reasons, nextStep, checks, mode, sender, company: evidence?.company ?? null, sources, dna, dnaMatch, dnaToken });

  // The badge and popup describe every open mail in the thread, worst first, and only once all of them have a final verdict.
  // A check in progress, a failure or the inbox clears them, so an old verdict can never stand in for a new mail.
  function syncToolbar() {
    const open = [...document.querySelectorAll("[data-message-id]")].filter((m) => bodyOf(m)?.offsetParent).map((m) => results.get(m.dataset.messageId.replace(/^#/, "")));
    const finished = open.filter((r) => r?.level);
    const worst = finished.reduce((a, b) => (SEVERITY[b.level] > SEVERITY[a.level] ? b : a), finished[0]);
    const complete = open.length > 0 && finished.length === open.length;
    const busy = open.includes("pending");
    const next = complete ? `${open.length}:${worst.level}:${worst.sender}:${worst.reasons[0]}` : busy ? "busy" : "";
    if (next === badge) return;
    badge = next;
    try {
      chrome.runtime.sendMessage(complete ? { type: "focus", result: toolbarReport(worst) } : { type: busy ? "scanning" : "clear" }, () => void chrome.runtime.lastError);
    } catch {
      badge = ""; // the extension was reloaded under this page
    }
  }

  function show(message, id, result) {
    clearStatus(message);
    if (message.querySelector(`[data-mailicious="${window.CSS.escape(id)}"]`)) return;
    (bodyOf(message)?.parentElement ?? message).prepend(card(result, id));
  }

  function resultFor(node) {
    const id = (node.closest("[data-message-id]")?.dataset.messageId ?? "").replace(/^#/, "");
    const r = results.get(id);
    return r === "pending" || r === undefined ? { failed: true } : r; // only a finished check, or the switch being off, skips the pause
  }

  function markInbox() {
    document.querySelectorAll("tr.zA:not([data-ps])").forEach((row) => {
      row.dataset.ps = "1";
      const sender = row.querySelector("[email]")?.getAttribute("email") ?? "";
      const words = `${row.querySelector(".bog")?.textContent ?? ""} ${row.querySelector(".y2")?.textContent ?? ""}`;
      if (!PLACEMENT.test(words) || !(RISKY.test(words) || FREE_MAIL.test(sender))) return;
      const dot = el("span", "", "● ");
      dot.style.color = "#a15c00";
      dot.title = "MAILicious: open this mail to check it";
      row.querySelector(".bog")?.prepend(dot);
    });
  }

  function scan() {
    markInbox();
    document.querySelectorAll("[data-message-id]").forEach((message) => {
      if (!bodyOf(message)?.offsetParent) return; // collapsed in the thread
      const id = message.dataset.messageId.replace(/^#/, "");
      const known = results.get(id);
      if (known?.failed) {
        if (!message.querySelector('[data-mailicious="status"]')) showStatus(message, id, FAILED_TEXT); // Gmail re-renders and drops it
      } else if (known && known !== "pending") show(message, id, known);
      else checkMessage(message);
    });
    syncToolbar();
  }

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest?.(".a3s a[href], .ii.gt a[href]");
      const result = link && resultFor(link);
      if (result?.level !== "high" && !result?.failed) return; // an unchecked mail gets the same pause as a fake one
      event.preventDefault();
      event.stopPropagation();
      linkWarning(link.href, !!result.failed, () => window.open(link.href, "_blank", "noopener"));
    },
    true,
  );

  document.addEventListener(
    "input",
    (event) => {
      const box = event.target.closest?.('[role="textbox"][contenteditable="true"], [g_editable="true"]');
      if (!box) return;
      const text = box.innerText;
      const hit = PRIVATE_DATA.find(([re]) => re.test(text));
      if (hit) toast(`You're about to send ${hit[1]}. Real recruiters don't ask for this by mail.`);
      else if (latest && latest.level !== "low" && /\b\d{4,8}\b/.test(text)) toast("That looks like an OTP, and this mail was flagged. Never share it.");
    },
    true,
  );

  // Mails skipped while the switch was off get checked once it's back on.
  chrome.storage.onChanged.addListener((changes) => {
    if (!changes.enabled?.newValue) return;
    for (const [id, value] of results) if (value === null) results.delete(id);
    schedule();
  });

  let timer;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(scan, 400);
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
