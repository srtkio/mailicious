const box = document.getElementById("enabled");
const byId = (id) => document.getElementById(id);
const CIRCUMFERENCE = 2 * Math.PI * 42;
const GAUGE = 2 * Math.PI * 38;
const SITE = "https://mailicious.vercel.app";
const SVG = "http://www.w3.org/2000/svg";
const CHECKING = ["Sender proof", "Where links go", "Attachments", "What it asks", "The company", "Domain age"];
const LOOK = {
  high: { title: "Likely fake", c: "#c81e1e", t: "#fbeaec", meaning: "We found proof this mail is dangerous." },
  medium: { title: "Check first", c: "#a15c00", t: "#fbf2e3", meaning: "Something doesn't add up, so verify before you act." },
  low: { title: "Looks safe", c: "#15803d", t: "#e8f3ec", meaning: "Nothing suspicious came up in our checks." },
};
const SIGN = { pass: ["✓", "#15803d"], warn: ["!", "#a15c00"], fail: ["✕", "#c81e1e"], skip: ["–", "#57534e"] };
// In plain words, so someone seeing this for the first time knows why each check matters.
const WHY = {
  "Sender authentication": "Proves the mail really came from the address shown.",
  "Scam DNA": "Is this a script your campus already marked fake?",
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

const stagger = (node, n) => (node.style.setProperty("--n", n), node);

function item(check, n) {
  const row = stagger(el("div", "item"), n);
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
    chrome.runtime.sendMessage({ type: "report", payload: { sender: result.sender, level: result.level, attack: result.attack, dna: result.dna, dnaToken: result.dnaToken } }, (ok) => {
      button.textContent = ok ? "Reported to your placement cell" : "Report failed, try again";
      button.disabled = !!ok;
    });
  };
  return button;
}

function circle(cls) {
  const node = document.createElementNS(SVG, "circle");
  node.setAttribute("class", cls);
  node.setAttribute("cx", "48");
  node.setAttribute("cy", "48");
  node.setAttribute("r", "38");
  return node;
}

// How many checks passed, drawn in once the verdict lands.
function gauge(checks) {
  const ran = checks.filter((c) => c.status !== "skip");
  const passed = ran.filter((c) => c.status === "pass").length;
  const box = el("div", "gauge");
  box.setAttribute("role", "img");
  box.setAttribute("aria-label", `${passed} of ${ran.length} checks passed`);
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 96 96");
  const arc = circle("arc");
  arc.style.strokeDasharray = GAUGE;
  arc.style.strokeDashoffset = GAUGE;
  svg.append(circle("track"), arc);
  box.append(svg, el("b", "", `${passed}/${ran.length}`));
  requestAnimationFrame(() => requestAnimationFrame(() => (arc.style.strokeDashoffset = GAUGE * (1 - (ran.length ? passed / ran.length : 0)))));
  return box;
}

// The mail's fingerprint as a barcode: 64 bits, tall or short.
function dnaStrip(result) {
  const box = el("div", "dna");
  const line = el("p", "", "Scam DNA: ");
  line.append(el("b", "", result.dnaMatch ? `${result.dnaMatch}% match with a scam your campus marked fake` : "this mail's script, ready to report"));
  const helix = el("div", "helix");
  helix.setAttribute("aria-hidden", "true");
  [...BigInt(`0x${result.dna}`).toString(2).padStart(64, "0")].forEach((bit, n) => {
    const bar = stagger(el("i"), n);
    bar.style.setProperty("--h", bit === "1" ? "100%" : "40%");
    helix.append(bar);
  });
  box.append(line, helix);
  return box;
}

function scanning(view) {
  byId("logo").classList.add("live");
  const box = el("div", "scanner");
  box.setAttribute("role", "status");
  const list = el("ul");
  CHECKING.forEach((label, n) => list.append(stagger(el("li", "", label), n)));
  box.append(el("b", "", "Checking this mail…"), list);
  view.append(box);
}

function emptyView(view) {
  const empty = el("div", "empty");
  const icon = document.createElementNS(SVG, "svg");
  icon.setAttribute("class", "mailbox");
  icon.setAttribute("viewBox", "0 0 64 48");
  icon.setAttribute("aria-hidden", "true");
  const frame = document.createElementNS(SVG, "rect");
  Object.entries({ x: 3, y: 3, width: 58, height: 42, rx: 4, fill: "#ff6a00" }).forEach(([k, v]) => frame.setAttribute(k, v));
  const flap = document.createElementNS(SVG, "path");
  Object.entries({ d: "M5 6l27 21L59 6", fill: "none", stroke: "#0a0a0a", "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round" }).forEach(([k, v]) => flap.setAttribute(k, v));
  icon.append(frame, flap);
  empty.append(icon, el("b", "", "No mail open"), "Open a mail in Gmail, and its full report appears here.");
  view.append(empty);
}

function showMail(result, busy) {
  const view = byId("view-mail");
  view.replaceChildren();
  byId("logo").classList.remove("live");
  if (!result) return busy ? scanning(view) : emptyView(view);
  const look = LOOK[result.level];
  const checks = result.checks ?? [];
  const head = el("div", "verdict");
  head.style.setProperty("--c", look.c);
  head.style.setProperty("--t", look.t);
  const words = el("div");
  words.append(el("h2", "", look.title));
  if (result.attack) words.append(el("small", "", result.attack));
  words.append(el("p", "", look.meaning), ...result.reasons.map((r) => el("p", "", r)), el("p", "next", result.nextStep));
  head.append(words);
  if (checks.some((c) => c.status !== "skip")) head.append(gauge(checks));
  view.append(head);

  const order = ["fail", "warn", "pass", "skip"];
  const bar = el("div", "bar");
  bar.setAttribute("aria-hidden", "true");
  const counts = order.map((s) => [s, checks.filter((c) => c.status === s).length]).filter(([, n]) => n);
  counts.forEach(([s, n], i) => {
    const part = stagger(el("i", s), i);
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
  if (result.level !== "low" && /^[0-9a-f]{16}$/.test(result.dna ?? "")) view.append(dnaStrip(result));
  if (result.level !== "low" && result.sender) {
    const actions = el("div", "actions");
    actions.append(reportButton(result));
    view.append(actions);
  }
  if (result.level !== "low") {
    const actions = el("div", "actions");
    const help = el("a", "main", "I already clicked or paid");
    // In the #fragment, so the sender never reaches a server.
    help.href = `${SITE}/rescue#${new URLSearchParams({ sender: result.sender ?? "", attack: result.attack ?? "" })}`;
    help.target = "_blank";
    help.rel = "noopener";
    actions.append(help);
    const letter = el("p", "letter");
    const scan = el("a", "", "Got an offer letter? X-ray the PDF");
    scan.href = `${SITE}/#letter`;
    scan.target = "_blank";
    scan.rel = "noopener";
    letter.append(scan);
    view.append(actions, letter);
  }
}

// Numbers count up once, when they're first shown.
function countUp(node, to) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !to) return (node.textContent = to);
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / 700);
    node.textContent = Math.round(to * (1 - (1 - t) ** 3));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
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
  byId("ink").classList.toggle("right", name === "stats");
}
byId("tab-mail").onclick = () => showTab("mail");
byId("tab-stats").onclick = () => showTab("stats");

chrome.storage.local.get({ enabled: true, checked: 0, caught: 0 }, (s) => {
  const clear = Math.max(0, s.checked - s.caught);
  const share = s.checked ? clear / s.checked : 0;
  box.checked = s.enabled;
  countUp(byId("checked"), s.checked);
  countUp(byId("clear"), clear);
  countUp(byId("caught"), s.caught);
  byId("share").textContent = s.checked ? `${Math.round(share * 100)}%` : "–";
  const arc = byId("safeArc");
  arc.style.strokeDasharray = CIRCUMFERENCE;
  arc.style.strokeDashoffset = CIRCUMFERENCE;
  requestAnimationFrame(() => requestAnimationFrame(() => (arc.style.strokeDashoffset = CIRCUMFERENCE * (1 - share))));
  byId("ring").setAttribute("aria-label", s.checked ? `${Math.round(share * 100)} percent of checked mails were clear` : "No mails checked yet");
  describe();
});

// Stays open through a running check, and swaps to the report the moment it lands.
chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
  const [report, scan] = [`tab:${tab?.id}`, `scan:${tab?.id}`];
  const render = async () => {
    const stored = tab ? await chrome.storage.session.get([report, scan]) : {};
    showMail(stored[report], !!stored[scan]);
  };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "session" && (report in changes || scan in changes)) render();
  });
  render();
});

box.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: box.checked });
  describe();
});
