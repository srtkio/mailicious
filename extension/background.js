// Calls the checker for the Gmail page. Only runs when the student's switch is on.
const API = "https://placementshield.vercel.app/api/check";

async function check(payload) {
  const { enabled = true } = await chrome.storage.local.get("enabled");
  if (!enabled) return null;
  const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) return null;
  const result = await res.json();
  const { checked = 0, caught = 0 } = await chrome.storage.local.get(["checked", "caught"]);
  await chrome.storage.local.set({ checked: checked + 1, caught: caught + (result.level === "low" ? 0 : 1) });
  return result;
}

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message.type !== "check") return false;
  check(message.payload).then(reply, () => reply(null));
  return true; // reply comes later
});
