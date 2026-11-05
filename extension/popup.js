const box = document.getElementById("enabled");
const note = document.getElementById("note");
const describe = () => (note.textContent = box.checked ? "On in Gmail." : "Off. Nothing is read or sent.");

chrome.storage.local.get({ enabled: true, checked: 0, caught: 0 }, (s) => {
  box.checked = s.enabled;
  document.getElementById("checked").textContent = s.checked;
  document.getElementById("caught").textContent = s.caught;
  describe();
});
box.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: box.checked });
  describe();
});
