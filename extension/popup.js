const box = document.getElementById("enabled");
const byId = (id) => document.getElementById(id);
const CIRCUMFERENCE = 2 * Math.PI * 42;

function describe() {
  byId("status").textContent = box.checked ? "Protecting Gmail" : "Switched off";
  byId("detail").textContent = box.checked ? "Each mail is checked as you open it." : "Nothing is read or sent.";
}

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

box.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: box.checked });
  describe();
});
