/* --------------------------------
   Class Scheduler (Share + Title + Import fix)
---------------------------------- */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const START_HOUR = 8;   // 8:00
const END_HOUR   = 20;  // 20:00 (8pm)
const SLOT_PER_HOUR = 2; // 30-minute increments

let HOUR_HEIGHT = 56;
function refreshComputedSizes() {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--slot-height"));
  HOUR_HEIGHT = Number.isFinite(v) ? v : 56;
}

/* Fixed vertical offset (from previous version) */
const BASELINE_OFFSET_MINUTES = 60;

const storageKey = "scheduleStateV2";

/** App state persisted, exported, and embedded in share links */
let state = {
  version: 2,
  title: "My Class Schedule",
  classes: []
};

// Elements
const scheduleGrid = document.getElementById("scheduleGrid");
const addClassBtn = document.getElementById("addClassBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const yearEl = document.getElementById("year");

const titleText = document.getElementById("titleText");
const editTitleBtn = document.getElementById("editTitleBtn");

// Share/Import controls
const copyLinkBtn = document.getElementById("copyLinkBtn");
const downloadBtn = document.getElementById("downloadBtn");
// Import: label triggers this reliably on all browsers
const fileInput = document.getElementById("fileInput");

// Modals
const classModal = document.getElementById("classModal");
const classForm = document.getElementById("classForm");
const deleteClassBtn = document.getElementById("deleteClassBtn");
const modalTitle = document.getElementById("modalTitle");
const formHelp = document.getElementById("formHelp");
const editingIdInput = document.getElementById("editingId");

const detailsModal = document.getElementById("detailsModal");
const detailsTitle = document.getElementById("detailsTitle");
const detailsTime  = document.getElementById("detailsTime");
const detailsDays  = document.getElementById("detailsDays");
const detailsTeacher = document.getElementById("detailsTeacher");
const detailsRoom    = document.getElementById("detailsRoom");
const editFromDetailsBtn = document.getElementById("editFromDetailsBtn");
const deleteFromDetailsBtn = document.getElementById("deleteFromDetailsBtn");

// Init
document.addEventListener("DOMContentLoaded", () => {
  refreshComputedSizes();
  yearEl.textContent = new Date().getFullYear();
  buildGrid();

  // 1) Try to load from share link
  loadFromURLIfPresent();
  // 2) Load from localStorage (and migrate from old key if present)
  loadFromLocalStorage();

  // Apply title
  titleText.textContent = state.title;

  render();
  wireUI();
});

/* ---------- UI Builders ---------- */

function buildGrid(){
  scheduleGrid.innerHTML = "";

  // Header row: blank top-left + day headers
  const topLeft = document.createElement("div");
  topLeft.className = "day-header";
  topLeft.style.position = "sticky";
  topLeft.style.left = "0";
  topLeft.style.zIndex = "6";
  scheduleGrid.appendChild(topLeft);

  DAYS.forEach(day => {
    const head = document.createElement("div");
    head.className = "day-header";
    head.textContent = day;
    scheduleGrid.appendChild(head);
  });

  const totalHours = END_HOUR - START_HOUR;

  // Time column
  const timeCol = document.createElement("div");
  timeCol.className = "time-col";
  for (let h = 0; h <= totalHours; h++){
    const label = document.createElement("div");
    label.className = "time-label";
    const hour = START_HOUR + h;
    label.style.height = `${HOUR_HEIGHT}px`;
    label.innerHTML = `<span>${formatHour(hour)}</span>`;
    timeCol.appendChild(label);
  }
  scheduleGrid.appendChild(timeCol);

  // Day columns
  for (let i = 0; i < 7; i++){
    const col = document.createElement("div");
    col.className = "day-col";
    col.dataset.day = DAYS[i];
    col.style.minHeight = `${HOUR_HEIGHT * totalHours}px`;
    scheduleGrid.appendChild(col);
  }
}

function wireUI(){
  addClassBtn.addEventListener("click", openAddModal);
  clearAllBtn.addEventListener("click", clearAll);

  // Title rename
  editTitleBtn.addEventListener("click", () => {
    const next = prompt("Schedule title:", state.title || "My Class Schedule");
    if (next && next.trim()){
      state.title = next.trim();
      titleText.textContent = state.title;
      saveToLocalStorage();
      // update share link silently in case user copies after rename
    }
  });

  // Share/Import
  copyLinkBtn.addEventListener("click", copyShareLink);
  downloadBtn.addEventListener("click", downloadJSON);

  // Import: listen for file selection (fix for “does nothing”)
  fileInput.addEventListener("change", importFromFile);

  // Modal close buttons
  document.querySelectorAll("[data-close-modal]").forEach(btn => {
    btn.addEventListener("click", e => e.currentTarget.closest("dialog")?.close());
  });

  classForm.addEventListener("submit", onSaveClass);
  deleteClassBtn.addEventListener("click", () => {
    const id = editingIdInput.value;
    if (id) {
      deleteClass(id);
      classModal.close();
    }
  });

  editFromDetailsBtn.addEventListener("click", () => {
    if (!currentDetailsId) return;
    detailsModal.close();
    openEditModal(currentDetailsId);
  });

  deleteFromDetailsBtn.addEventListener("click", () => {
    if (!currentDetailsId) return;
    deleteClass(currentDetailsId);
    detailsModal.close();
  });

  // Dismiss dialogs on backdrop click
  [classModal, detailsModal].forEach(d => {
    d.addEventListener("click", (e) => {
      const rect = d.querySelector(".modal-card").getBoundingClientRect();
      const inDialog =
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!inDialog) d.close();
    });
  });

  // Keyboard shortcut
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "n" && !classModal.open && !detailsModal.open) openAddModal();
  });

  // Recompute sizes on resize
  window.addEventListener("resize", () => {
    refreshComputedSizes();
    buildGrid();
    render();
  });
}

/* ---------- Persistence ---------- */

function loadFromLocalStorage(){
  try{
    // New format
    const raw = localStorage.getItem(storageKey);
    if (raw){
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object"){
        state = { version: 2, title: obj.title || "My Class Schedule", classes: Array.isArray(obj.classes) ? obj.classes : [] };
        return;
      }
    }
    // Migrate from old key (classes only)
    const oldRaw = localStorage.getItem("scheduleDataV1");
    if (oldRaw){
      const classes = JSON.parse(oldRaw) || [];
      state.classes = Array.isArray(classes) ? classes : [];
      saveToLocalStorage();
    }
  }catch(e){
    console.warn("Failed to parse stored schedule:", e);
  }
}

function saveToLocalStorage(){
  localStorage.setItem(storageKey, JSON.stringify(state));
}

/* ---------- Share / Import / Export ---------- */

function buildShareURL(){
  const json = JSON.stringify(state);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  const url = new URL(window.location.href);
  url.searchParams.set("s", b64);
  return url.toString();
}

async function copyShareLink(){
  const link = buildShareURL();
  try{
    await navigator.clipboard.writeText(link);
    toast("Share link copied to clipboard.");
  }catch{
    prompt("Copy this link:", link);
  }
}

function loadFromURLIfPresent(){
  const url = new URL(window.location.href);
  const s = url.searchParams.get("s");
  if (!s) return;
  try{
    const json = decodeURIComponent(escape(atob(s)));
    const incoming = JSON.parse(json);
    if (incoming && typeof incoming === "object"){
      // Backward compatibility: old links might be an array
      if (Array.isArray(incoming)){
        state.classes = incoming;
      } else {
        state.title = incoming.title || state.title;
        state.classes = Array.isArray(incoming.classes) ? incoming.classes : [];
      }
      saveToLocalStorage();
      toast("Loaded schedule from link.");
      // remove param to avoid re-imports
      url.searchParams.delete("s");
      history.replaceState(null, "", url.toString());
    }
  }catch(e){
    console.warn("Failed to load from URL:", e);
  }
}

function downloadJSON(){
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(state.title || "schedule").replace(/\s+/g,"_")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importFromFile(e){
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const incoming = JSON.parse(reader.result);
      if (Array.isArray(incoming)){
        // very old export (classes only)
        state.classes = incoming;
      } else if (incoming && typeof incoming === "object"){
        state.title = incoming.title || state.title;
        state.classes = Array.isArray(incoming.classes) ? incoming.classes : [];
      } else {
        return alert("Invalid file format.");
      }
      titleText.textContent = state.title;
      saveToLocalStorage();
      render();
      toast("Schedule imported.");
    }catch{
      alert("Could not parse the JSON file.");
    }finally{
      // allow re-importing the same file consecutively
      e.target.value = "";
    }
  };
  reader.readAsText(file);
}

/* ---------- CRUD ---------- */

function onSaveClass(e){
  e.preventDefault();
  formHelp.textContent = "";

  const data = getFormData();
  if (!data) return;

  if (editingIdInput.value){
    const idx = state.classes.findIndex(c => c.id === editingIdInput.value);
    if (idx !== -1) state.classes[idx] = { ...state.classes[idx], ...data };
  } else {
    state.classes.push({ id: crypto.randomUUID(), ...data });
  }

  saveToLocalStorage();
  render();

  classModal.close();
  classForm.reset();
  resetModalForAdd();
}

function deleteClass(id){
  state.classes = state.classes.filter(c => c.id !== id);
  saveToLocalStorage();
  render();
}

function openAddModal(){
  resetModalForAdd();
  classModal.showModal();
}

function resetModalForAdd(){
  modalTitle.textContent = "Add Class";
  deleteClassBtn.classList.add("hidden");
  editingIdInput.value = "";
  formHelp.textContent = "";
}

function openEditModal(id){
  const cls = state.classes.find(c => c.id === id);
  if (!cls) return;

  modalTitle.textContent = "Edit Class";
  deleteClassBtn.classList.remove("hidden");
  editingIdInput.value = id;

  document.getElementById("className").value = cls.name || "";
  document.getElementById("teacher").value = cls.teacher || "";
  document.getElementById("room").value = cls.room || "";
  document.getElementById("startTime").value = cls.start;
  document.getElementById("endTime").value = cls.end;
  document.getElementById("color").value = cls.color || "#4f46e5";

  // Days
  const dayInputs = classForm.querySelectorAll('input[name="days"]');
  dayInputs.forEach(inp => inp.checked = (cls.days || []).includes(inp.value));

  classModal.showModal();
}

/* ---------- Rendering ---------- */

let currentDetailsId = null;

function render(){
  document.querySelectorAll(".day-col").forEach(col => col.innerHTML = "");

  const byDay = {};
  DAYS.forEach(d => byDay[d] = []);

  state.classes.forEach(cls => (cls.days || []).forEach(day => byDay[day].push(cls)));

  DAYS.forEach(day => {
    const col = document.querySelector(`.day-col[data-day="${day}"]`);
    const blocks = (byDay[day] || []).map(cls => ({
      ...cls,
      top: timeToPixels(cls.start),
      height: durationToPixels(cls.start, cls.end)
    }));

    const laidOut = computeLanes(blocks);

    laidOut.forEach((blk) => {
      const el = document.createElement("div");
      el.className = `class-block lane-${blk.lane}`;
      el.style.top = `${blk.top}px`;
      el.style.height = `${blk.height}px`;
      el.style.background = blk.color || "var(--accent)";
      el.style.borderLeft = "4px solid rgba(255,255,255,.2)";
      el.dataset.id = blk.id;

      el.innerHTML = `
        <div class="class-title">${escapeHTML(blk.name)}</div>
        <div class="class-meta">
          <span>${formatTimeRange(blk.start, blk.end)}</span>
          ${blk.room ? `<span>• ${escapeHTML(blk.room)}</span>` : ""}
        </div>
      `;

      el.addEventListener("click", () => openDetails(blk.id));
      col.appendChild(el);
    });
  });
}

function openDetails(id){
  const cls = state.classes.find(c => c.id === id);
  if (!cls) return;

  currentDetailsId = id;
  detailsTitle.textContent = cls.name || "Class";
  detailsTime.textContent = formatTimeRange(cls.start, cls.end);
  detailsDays.textContent = (cls.days || []).join(", ") || "—";
  detailsTeacher.textContent = cls.teacher || "—";
  detailsRoom.textContent = cls.room || "—";

  detailsModal.showModal();
}

/* ---------- Helpers ---------- */

function getFormData(){
  const name = document.getElementById("className").value.trim();
  const teacher = document.getElementById("teacher").value.trim();
  const room = document.getElementById("room").value.trim();
  const start = document.getElementById("startTime").value;
  const end = document.getElementById("endTime").value;
  const color = document.getElementById("color").value;
  const days = Array.from(classForm.querySelectorAll('input[name="days"]:checked')).map(i => i.value);

  if (!name){ formHelp.textContent = "Please enter a class name."; return null; }
  if (!start || !end){ formHelp.textContent = "Please enter both start and end times."; return null; }
  if (timeToMinutes(start) >= timeToMinutes(end)){ formHelp.textContent = "End time must be after start time."; return null; }
  if (days.length === 0){ formHelp.textContent = "Select at least one day."; return null; }

  return { name, teacher, room, start, end, days, color };
}

function timeToMinutes(t){ const [h, m] = t.split(":").map(Number); return h * 60 + m; }

function timeToPixels(t){
  const mins = timeToMinutes(t);
  const startMins = START_HOUR * 60;
  const offset = Math.max(0, mins - startMins + BASELINE_OFFSET_MINUTES);
  const hourFrac = offset / 60;
  return hourFrac * HOUR_HEIGHT;
}

function durationToPixels(start, end){
  const durMins = timeToMinutes(end) - timeToMinutes(start);
  return (durMins / 60) * HOUR_HEIGHT;
}

function formatHour(h){ const isPM = h >= 12; const hr12 = ((h + 11) % 12) + 1; return `${hr12}${isPM ? "pm" : "am"}`; }
function formatTimeRange(start, end){ return `${to12hr(start)} – ${to12hr(end)}`; }
function to12hr(t){ let [h, m] = t.split(":").map(Number); const isPM = h >= 12; const hr12 = ((h + 11) % 12) + 1; return `${hr12}:${String(m).padStart(2,'0')} ${isPM ? "PM" : "AM"}`; }
function escapeHTML(str){ return str.replace(/[&<>"']/g, s => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[s])); }

/* Overlap lane calculation */
function computeLanes(blocks){
  const sorted = [...blocks].sort((a,b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const lanes = []; // end times per lane
  const result = [];
  for (const blk of sorted){
    let lane = 0;
    while (lane < lanes.length && timeToMinutes(blk.start) < lanes[lane]) lane++;
    lanes[lane] = timeToMinutes(blk.end);
    result.push({ ...blk, lane });
  }
  return result;
}

/* ---------- Bulk ops ---------- */

function clearAll(){
  if (!confirm("Delete all classes from your schedule?")) return;
  state.classes = [];
  saveToLocalStorage();
  render();
}

/* Tiny toast helper */
function toast(msg){
  const t = document.createElement("div");
  t.textContent = msg;
  Object.assign(t.style, {
    position: "fixed", bottom: "16px", left: "50%", transform: "translateX(-50%)",
    background: "#0f1422", color: "#e6e8ed", padding: "10px 14px",
    borderRadius: "10px", boxShadow: "0 10px 30px rgba(0,0,0,.35), inset 0 0 0 1px #2b3550",
    zIndex: 9999, fontSize: "14px"
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1800);
}
