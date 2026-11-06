// Calls the checker for the Gmail page. Only runs when the student's switch is on.
const API = "https://mailicious.vercel.app/api/check";

async function check(payload) {
  const { enabled = true } = await chrome.storage.local.get("enabled");
  if (!enabled) return { off: true };
  const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(25000) });
  if (!res.ok) return null;
  const result = await res.json();
  const { checked = 0, caught = 0 } = await chrome.storage.local.get(["checked", "caught"]);
  await chrome.storage.local.set({ checked: checked + 1, caught: caught + (result.level === "low" ? 0 : 1) });
  return result;
}

async function report(payload) {
  const res = await fetch(API.replace("/check", "/report"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  return res.ok;
}

// A report must never outlive the page it describes.
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status !== "loading") return;
  stopScan(tabId);
  chrome.storage.session.remove(`tab:${tabId}`);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  stopScan(tabId);
  chrome.storage.session.remove(`tab:${tabId}`);
});

const SCAN_FRAMES = ["·", "··", "···"];
const SCAN_MS = 320;
const SCAN_LIMIT = 100; // about 30s, longer than any check, so the dots can't run forever
const scans = new Map();

// The toolbar icon counts dots while a mail is being checked, and the popup watches the same flag.
function startScan(tabId) {
  if (scans.has(tabId)) return;
  let frame = 0;
  const tick = () => {
    if (frame >= SCAN_LIMIT) {
      stopScan(tabId);
      return chrome.action.setBadgeText({ tabId, text: "" });
    }
    chrome.action.setBadgeText({ tabId, text: SCAN_FRAMES[frame++ % SCAN_FRAMES.length] }).catch(() => stopScan(tabId));
  };
  scans.set(tabId, setInterval(tick, SCAN_MS));
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#ff6a00" });
  chrome.storage.session.remove(`tab:${tabId}`);
  chrome.storage.session.set({ [`scan:${tabId}`]: true });
  tick();
}

function stopScan(tabId) {
  clearInterval(scans.get(tabId));
  scans.delete(tabId);
  return chrome.storage.session.remove(`scan:${tabId}`);
}

const BADGE = { low: ["✓", "#15803d"], medium: ["!", "#a15c00"], high: ["!!", "#c81e1e"] };

// The popup shows this report. It lives in session storage, so it's gone when the browser closes, and holds no mail text.
async function focusMail(tabId, result) {
  await stopScan(tabId);
  const [text, color] = BADGE[result.level];
  await chrome.storage.session.set({ [`tab:${tabId}`]: result });
  await chrome.action.setBadgeBackgroundColor({ tabId, color });
  await chrome.action.setBadgeText({ tabId, text });
}

async function clearMail(tabId) {
  await stopScan(tabId);
  await chrome.storage.session.remove(`tab:${tabId}`);
  await chrome.action.setBadgeText({ tabId, text: "" });
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const tabId = sender.tab?.id;
  if (message.type === "focus" && tabId !== undefined) focusMail(tabId, message.result).then(reply, () => reply(false));
  else if (message.type === "clear" && tabId !== undefined) clearMail(tabId).then(reply, () => reply(false));
  else if (message.type === "scanning" && tabId !== undefined) (startScan(tabId), reply(true));
  else if (message.type === "report") report(message.payload).then(reply, () => reply(false));
  else if (message.type === "check") check(message.payload).then(reply, () => reply(null));
  else return false;
  return true; // reply comes later
});
