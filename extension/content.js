// Runs inside Gmail. Stays silent unless a placement mail needs a warning.
// Only placement-looking mails ever leave the browser, and only their text, sender, links and headers.
(() => {
  if (window.__placementShield) return;
  window.__placementShield = true;

  // Deliberately narrow: a shopping "offer" must never leave the browser.
  const PLACEMENT = /\b(offer letter|job offer|internship|intern|placement|hiring|recruit\w*|job opening|job opportunity|selected for|shortlisted|interview|stipend|salary|ctc|career\w*)\b/i;
  const RISKY = /\b(otp|registration fee|processing fee|security deposit|aadhaa?r|pan card|bank details|whatsapp|telegram)\b/i;
  const FREE_MAIL = /@(gmail|yahoo|outlook|hotmail|rediffmail)\.[a-z.]+$/i;
  const PRIVATE_DATA = [
    [/\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/, "a card number"], // before Aadhaar, whose 12 digits a card also contains
    [/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/, "an Aadhaar number"],
    [/\b[A-Z]{5}\d{4}[A-Z]\b/, "a PAN number"],
  ];
  const STYLE = {
    high: { label: "Likely fake", color: "#b3122a", tint: "#fbeaec" },
    medium: { label: "Check first", color: "#8a5200", tint: "#fbf2e3" },
    low: { label: "No red flags", color: "#1c6b48", tint: "#e8f3ec" },
  };
  const CSS = `
    :host { all: initial; display: block; font: 14px/1.45 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #16233f; }
    .card { border-left: 4px solid var(--c); background: var(--t); padding: 12px 14px; margin: 8px 0 12px; border-radius: 4px; }
    .top { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
    .label { font-weight: 800; font-size: 16px; color: var(--c); }
    .attack { color: #4a5870; }
    ul { margin: 6px 0; padding-left: 18px; }
    .next { font-weight: 700; margin: 6px 0 0; }
    details { margin-top: 8px; }
    summary { cursor: pointer; color: #2a2f8f; }
    .row { display: grid; grid-template-columns: 16px 1fr; gap: 6px; margin-top: 4px; }
    a { color: #2a2f8f; }
    .pill { display: inline-block; color: var(--c); font-size: 12px; margin: 4px 0 8px; }
    .overlay { position: fixed; inset: 0; z-index: 2147483647; background: rgba(22, 35, 63, .55); display: grid; place-items: center; padding: 16px; }
    .box { background: #fff; max-width: 420px; padding: 20px; border-radius: 6px; }
    .box h2 { margin: 0 0 8px; font-size: 18px; color: #b3122a; }
    .box code { word-break: break-all; }
    .actions { display: flex; gap: 10px; margin-top: 14px; }
    button { font: inherit; padding: 8px 14px; border: 1px solid #2a2f8f; background: #fff; color: #2a2f8f; border-radius: 4px; cursor: pointer; }
    button.main { background: #2a2f8f; color: #fff; }
    button.report { margin-top: 8px; padding: 5px 10px; }
    .toast { position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; max-width: 340px; background: #b3122a; color: #fff; padding: 12px 14px; border-radius: 6px; }
  `;
  const MARKS = { pass: "✓", warn: "!", fail: "✕", skip: "–" };
  // Selectors as gmail.js and InboxSDK use them; the second of each pair is InboxSDK's fallback.
  const bodyOf = (message) => message.querySelector(".a3s") ?? message.querySelector(".ii.gt");

  const results = new Map(); // message id -> result, or "pending"
  let latest = null;

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text; // always text: mail content comes from scammers
    return node;
  };
  function shadowHost(id) {
    const host = document.createElement("div");
    host.dataset.placementshield = id;
    const root = host.attachShadow({ mode: "open" });
    root.append(el("style", "", CSS));
    return { host, root };
  }

  function card(result, id) {
    const { host, root } = shadowHost(id);
    const style = STYLE[result.level];
    host.style.setProperty("--c", style.color);
    host.style.setProperty("--t", style.tint);
    if (result.level === "low") {
      root.append(el("span", "pill", "✓ PlacementShield: no red flags"));
      return host;
    }
    const box = el("div", "card");
    const top = el("div", "top");
    top.append(el("span", "label", style.label));
    if (result.attack) top.append(el("span", "attack", result.attack));
    const list = el("ul");
    result.reasons.forEach((r) => list.append(el("li", "", r)));
    const more = el("details");
    more.append(el("summary", "", "Security report"));
    (result.checks ?? []).forEach((c) => {
      const row = el("div", "row");
      row.append(el("span", "", MARKS[c.status]), el("span", "", `${c.label}: ${c.detail}`));
      more.append(row);
    });
    if (result.evidence?.company) more.append(el("p", "", result.evidence.company));
    (result.sources ?? []).filter((s) => /^https:/.test(s.url)).forEach((s) => {
      const a = el("a", "", s.title);
      a.href = s.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      more.append(el("br"), a);
    });
    box.append(top, list, el("p", "next", result.nextStep));
    if (result.sender) box.append(reportButton(result));
    box.append(more);
    root.append(box);
    return host;
  }

  function reportButton(result) {
    const button = el("button", "report", "Report this sender");
    button.onclick = () => {
      button.disabled = true;
      button.textContent = "Reporting…";
      chrome.runtime.sendMessage({ type: "report", payload: { sender: result.sender, level: result.level, attack: result.attack } }, (ok) => {
        button.textContent = !chrome.runtime.lastError && ok ? "Reported to your placement cell" : "Report failed, try again";
        button.disabled = !chrome.runtime.lastError && ok;
      });
    };
    return button;
  }

  function linkWarning(url, go) {
    const { host, root } = shadowHost("warning");
    const overlay = el("div", "overlay");
    const box = el("div", "box");
    box.append(el("h2", "", "Wait. This mail looks fake."), el("p", "", "This link came from a mail PlacementShield flagged. It may steal your details."), el("code", "", url));
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
    document.querySelector('[data-placementshield="toast"]')?.remove(); // the newest warning is the most specific
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
      const res = await fetch(`${location.origin}${account}/?${ik ? `ik=${ik}&` : ""}view=om&${ref}`, { credentials: "same-origin" });
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
    if (!text || !PLACEMENT.test(`${subject} ${text}`)) return results.set(id, null);

    results.set(id, "pending");
    const sender = message.querySelector(".gD[email], td.gF span[email]")?.getAttribute("email") ?? "";
    const anchors = [...body.querySelectorAll("a[href]")].filter((a) => /^https?:/i.test(a.href)).slice(0, 40);
    const linkPairs = anchors.map((a) => ({ text: a.textContent.trim().slice(0, 300), href: a.href.slice(0, 2000) }));
    const attachments = [...message.querySelectorAll(".aV3")].map((n) => n.textContent.trim().slice(0, 200)).filter(Boolean).slice(0, 20);
    const headers = await fetchHeaders(id, message.dataset.legacyMessageId);

    const result = await new Promise((done) =>
      chrome.runtime.sendMessage({ type: "check", payload: { text: `${subject}\n${text}`.slice(0, 20000), sender, linkPairs, attachments, ...(headers ? { headers } : {}) } }, (r) => done(chrome.runtime.lastError ? null : r)),
    );
    results.set(id, result);
    if (!result) return;
    latest = result;
    show(message, id, result);
  }

  function show(message, id, result) {
    if (message.querySelector(`[data-placementshield="${window.CSS.escape(id)}"]`)) return;
    (bodyOf(message)?.parentElement ?? message).prepend(card(result, id));
  }

  function resultFor(node) {
    const id = (node.closest("[data-message-id]")?.dataset.messageId ?? "").replace(/^#/, "");
    const r = results.get(id);
    return r && r !== "pending" ? r : null;
  }

  function markInbox() {
    document.querySelectorAll("tr.zA:not([data-ps])").forEach((row) => {
      row.dataset.ps = "1";
      const sender = row.querySelector("[email]")?.getAttribute("email") ?? "";
      const words = `${row.querySelector(".bog")?.textContent ?? ""} ${row.querySelector(".y2")?.textContent ?? ""}`;
      if (!PLACEMENT.test(words) || !(RISKY.test(words) || FREE_MAIL.test(sender))) return;
      const dot = el("span", "", "● ");
      dot.style.color = "#8a5200";
      dot.title = "PlacementShield: open this mail to check it";
      row.querySelector(".bog")?.prepend(dot);
    });
  }

  function scan() {
    markInbox();
    document.querySelectorAll("[data-message-id]").forEach((message) => {
      if (!bodyOf(message)?.offsetParent) return; // collapsed in the thread
      const id = message.dataset.messageId.replace(/^#/, "");
      const known = results.get(id);
      if (known && known !== "pending") show(message, id, known); // Gmail re-renders and drops the card
      else checkMessage(message);
    });
  }

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest?.(".a3s a[href], .ii.gt a[href]");
      if (!link || resultFor(link)?.level !== "high") return;
      event.preventDefault();
      event.stopPropagation();
      linkWarning(link.href, () => window.open(link.href, "_blank", "noopener"));
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

  let timer;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(scan, 400);
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
