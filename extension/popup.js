const box = document.getElementById("enabled");
const byId = (id) => document.getElementById(id);
const CIRCUMFERENCE = 2 * Math.PI * 42;
const LOOK = {
  high: { title: "Likely fake", c: "#c81e1e", t: "#fbeaec", meaning: "We found proof this mail is dangerous." },
  medium: { title: "Check first", c: "#a15c00", t: "#fbf2e3", meaning: "Something doesn't add up, so verify before you act." },
  low: { title: "Looks safe", c: "#15803d", t: "#e8f3ec", meaning: "Nothing suspicious came up in our checks." },
};
const SIGN = { pass: ["✓", "#15803d"], warn: ["!", "#a15c00"], fail: ["✕", "#c81e1e"], skip: ["–", "#57534e"] };
// In plain words, so someone seeing this for the first time knows why each check matters.
const WHY = {
  "Sender authentication": "Proves the mail really came from the address shown.",
  "Reply address": "Scammers can make your reply go somewhere else.",
  "Domain age": "Scam sites are often only days old.",
  "Mail server": "Real companies can receive mail at their domain.",
  "Anti-spoofing policy": "Stops others from faking this domain.",
  "Link reputation": "Checks links against lists of known dangerous sites.",
  "Sender identity": "Does the address fit who they claim to be?",
  Links: "Do links go where they say they go?",
  Forms: "Does a linked form ask for anything sensitive?",
  Attachments: "Is a file secretly a program?",
  "What it asks for": "Money, codes and ID are the usual goals of a scam.",
  "Does the offer add up": "Offers that seem too good usually are.",
};

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text; // always text: it can quote scammers
  return node;
};

function item(check) {
  const row = el("div", "item");
  const sign = el("span", "sign", SIGN[check.status][0]);
  sign.style.color = SIGN[check.status][1];
  const body = el("div");
  body.append(el("b", "", check.label), el("span", "d", check.status === "pass" || check.status === "skip" ? WHY[check.label] ?? check.detail : check.detail));
  row.append(sign, body);
  return row;
}

function reportButton(result) {
  const button = el("button", "main", "Report this sender");
  button.onclick = () => {
    button.disabled = true;
    button.textContent = "Reporting…";
    chrome.runtime.sendMessage({ type: "report", payload: { sender: result.sender, level: result.level, attack: result.attack } }, (ok) => {
      button.textContent = ok ? "Reported to your placement cell" : "Report failed, try again";
      button.disabled = !!ok;
    });
  };
  return button;
}

function showMail(result) {
  const view = byId("view-mail");
  if (!result) {
    const empty = el("div", "empty");
    empty.append(el("b", "", "No mail open"), "Open a mail in Gmail, and its full report appears here.");
    view.append(empty);
    return;
  }
  const look = LOOK[result.level];
  const head = el("div", "verdict");
  head.style.setProperty("--c", look.c);
  head.style.setProperty("--t", look.t);
  head.append(el("h2", "", look.title));
  if (result.attack) head.append(el("small", "", result.attack));
  head.append(el("p", "", look.meaning), ...result.reasons.map((r) => el("p", "", r)), el("p", "next", result.nextStep));
  view.append(head);

  const checks = result.checks ?? [];
  const order = ["fail", "warn", "pass", "skip"];
  const bar = el("div", "bar");
  bar.setAttribute("aria-hidden", "true");
  const counts = order.map((s) => [s, checks.filter((c) => c.status === s).length]).filter(([, n]) => n);
  counts.forEach(([s, n]) => {
    const part = el("i", s);
    part.style.flexGrow = n;
    bar.append(part);
  });
  const said = { fail: "failed", warn: "to check", pass: "passed", skip: "not checked" };
  view.append(bar, el("p", "count", counts.map(([s, n]) => `${n} ${said[s]}`).join(", ")));

  const problems = checks.filter((c) => c.status === "fail" || c.status === "warn");
  if (problems.length) {
    const group = el("div", "group");
    group.append(el("h3", "", "What we found"), ...problems.map(item));
    view.append(group);
  }
  const rest = checks.filter((c) => c.status === "pass" || c.status === "skip");
  if (rest.length) {
    const more = el("details");
    if (!problems.length) more.open = true;
    more.append(el("summary", "", `Everything else we checked (${rest.length})`), ...rest.map(item));
    view.append(more);
  }
  if (result.company) view.append(el("p", "about", `About the company: ${result.company}`));
  (result.sources ?? []).filter((s) => /^https:/.test(s.url)).forEach((s) => {
    const a = el("a", "", s.title);
    a.href = s.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    const line = el("p", "about");
    line.append(a);
    view.append(line);
  });
  if (result.mode === "limited") view.append(el("p", "about", "This was a basic check, because the AI wasn't available."));
  if (result.level !== "low" && result.sender) {
    const actions = el("div", "actions");
    actions.append(reportButton(result));
    view.append(actions);
  }
}

function describe() {
  byId("status").textContent = box.checked ? "Protecting Gmail" : "Switched off";
  byId("detail").textContent = box.checked ? "Each mail is checked as you open it." : "Nothing is read or sent.";
}

function showTab(name) {
  for (const tab of ["mail", "stats"]) {
    byId(`tab-${tab}`).setAttribute("aria-selected", String(tab === name));
    byId(`view-${tab}`).hidden = tab !== name;
  }
}
byId("tab-mail").onclick = () => showTab("mail");
byId("tab-stats").onclick = () => showTab("stats");

chrome.storage.local.get({ enabled: true, checked: 0, caught: 0 }, (s) => {
  const clear = Math.max(0, s.checked - s.caught);
  const share = s.checked ? clear / s.checked : 0;
  box.checked = s.enabled;
  byId("checked").textContent = s.checked;
  byId("clear").textContent = clear;
  byId("caught").textContent = s.caught;
  byId("share").textContent = s.checked ? `${Math.round(share * 100)}%` : "–";
  const arc = byId("safeArc");
  arc.style.strokeDasharray = CIRCUMFERENCE;
  arc.style.strokeDashoffset = CIRCUMFERENCE * (1 - share);
  byId("ring").setAttribute("aria-label", s.checked ? `${Math.round(share * 100)} percent of checked mails were clear` : "No mails checked yet");
  describe();
});

chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
  const key = `tab:${tab?.id}`;
  const stored = tab ? await chrome.storage.session.get(key) : {};
  showMail(stored[key]);
});

box.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: box.checked });
  describe();
});
