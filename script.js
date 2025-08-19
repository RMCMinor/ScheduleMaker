/* -----------------------------
   Class Scheduler
   - Weekly grid with days across (Sun-Sat), times down
   - Add/Edit via modal, click class to view details
   - Saves to localStorage
-------------------------------- */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const START_HOUR = 8;   // 8:00
const END_HOUR   = 20;  // 20:00 (8pm)
const SLOT_PER_HOUR = 2; // 30-min increments
const HOUR_HEIGHT = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--slot-height')) || 56;

const storageKey = "scheduleDataV1";
let classes = []; // array of class objects

// Elements
const scheduleGrid = document.getElementById("scheduleGrid");
const scheduleWrapper = document.getElementById("scheduleWrapper");
const addClassBtn = document.getElementById("addClassBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const yearEl = document.getElementById("year");

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

// State for selected class in details
let currentDetailsId = null;

// Init
document.addEventListener("DOMContentLoaded", () => {
  yearEl.textContent = new Date().getFullYear();
  buildGrid();
  load();
  render();
  wireUI();
});

/* ---------- UI Builders ---------- */

function buildGrid(){
  // Clear
  scheduleGrid.innerHTML = "";

  // Header row: blank top-left + 7 day headers
  const topLeft = document.createElement("div");
  topLeft.className = "day-header";
  topLeft.style.position = "sticky";
  topLeft.style.left = "0";
  topLeft.style.zIndex = "6";
  topLeft.textContent = ""; // empty corner
  scheduleGrid.appendChild(topLeft);

  DAYS.forEach(day => {
    const head = document.createElement("div");
    head.className = "day-header";
    head.textContent = day;
    scheduleGrid.appendChild(head);
  });

  // Time column + 7 day columns
  const totalHours = END_HOUR - START_HOUR;
  const totalHalfHours = totalHours * SLOT_PER_HOUR;

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

  // Modal close buttons
  document.querySelectorAll("[data-close-modal]").forEach(btn => {
    btn.addEventListener("click", e => {
      const dlg = e.currentTarget.closest("dialog");
      dlg?.close();
    });
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

  // Close dialogs on backdrop click (native <dialog> doesn’t close automatically)
  [classModal, detailsModal].forEach(d => {
    d.addEventListener("click", (e) => {
      const rect = d.querySelector(".modal-card").getBoundingClientRect();
      const inDialog = (
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom
      );
      if (!inDialog) d.close();
    });
  });
}

/* ---------- Storage ---------- */

function load(){
  try{
    const raw = localStorage.getItem(storageKey);
    classes = raw ? JSON.parse(raw) : [];
  }catch(e){
    console.warn("Failed to parse schedule storage:", e);
    classes = [];
  }
}

function save(){
  localStorage.setItem(storageKey, JSON.stringify(classes));
}

/* ---------- CRUD ---------- */

function onSaveClass(e){
  e.preventDefault();
  formHelp.textContent = "";

  const data = getFormData();
  if (!data) return; // validation message already set

  if (editingIdInput.value){
    // Update
    const idx = classes.findIndex(c => c.id === editingIdInput.value);
    if (idx !== -1) classes[idx] = { ...classes[idx], ...data };
  } else {
    classes.push({ id: crypto.randomUUID(), ...data });
  }

  save();
  render();

  classModal.close();
  classForm.reset();
  resetModalForAdd();
}

function deleteClass(id){
  classes = classes.filter(c => c.id !== id);
  save();
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
  const cls = classes.find(c => c.id === id);
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

function render(){
  // Clear existing blocks
  document.querySelectorAll(".day-col").forEach(col => col.innerHTML = "");

  // For each day, compute positioned blocks
  const byDay = {};
  DAYS.forEach(d => byDay[d] = []);

  classes.forEach(cls => {
    (cls.days || []).forEach(day => {
      byDay[day].push(cls);
    });
  });

  DAYS.forEach(day => {
    const col = document.querySelector(`.day-col[data-day="${day}"]`);
    const blocks = (byDay[day] || []).map(cls => ({
      ...cls,
      top: timeToPixels(cls.start),
      height: durationToPixels(cls.start, cls.end)
    }));

    // Overlap layout: assign lanes for overlapping blocks
    const laidOut = computeLanes(blocks);

    laidOut.forEach((blk, i) => {
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
  const cls = classes.find(c => c.id === id);
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

  if (!name){
    formHelp.textContent = "Please enter a class name.";
    return null;
  }
  if (!start || !end){
    formHelp.textContent = "Please enter both start and end times.";
    return null;
  }
  if (!isStartBeforeEnd(start, end)){
    formHelp.textContent = "End time must be after start time.";
    return null;
  }
  if (days.length === 0){
    formHelp.textContent = "Select at least one day.";
    return null;
  }

  return { name, teacher, room, start, end, days, color };
}

function isStartBeforeEnd(start, end){
  return timeToMinutes(start) < timeToMinutes(end);
}

function timeToMinutes(t){
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function timeToPixels(t){
  const mins = timeToMinutes(t);
  const startMins = START_HOUR * 60;
  const offset = Math.max(0, mins - startMins);
  const hourFrac = offset / 60;
  return hourFrac * HOUR_HEIGHT;
}

function durationToPixels(start, end){
  const durMins = timeToMinutes(end) - timeToMinutes(start);
  return (durMins / 60) * HOUR_HEIGHT;
}

function formatHour(h){
  const isPM = h >= 12;
  const hr12 = ((h + 11) % 12) + 1;
  return `${hr12}${isPM ? "pm" : "am"}`;
}

function formatTimeRange(start, end){
  return `${to12hr(start)} – ${to12hr(end)}`;
}

function to12hr(t){
  let [h, m] = t.split(":").map(Number);
  const isPM = h >= 12;
  const hr12 = ((h + 11) % 12) + 1;
  return `${hr12}:${String(m).padStart(2,'0')} ${isPM ? "PM" : "AM"}`;
}

function escapeHTML(str){
  return str.replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[s]));
}

/* Overlap lane calculation:
   Greedy sweep-line: sort by start, assign the lowest free lane;
   If overlapping, push into next lane (up to 4 lanes styled; more will still stack). */
function computeLanes(blocks){
  const sorted = [...blocks].sort((a,b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const lanes = []; // array of end times per lane
  const result = [];

  for (const blk of sorted){
    let lane = 0;
    while (lane < lanes.length && timeToMinutes(blk.start) < lanes[lane]) {
      lane++;
    }
    lanes[lane] = timeToMinutes(blk.end);
    result.push({ ...blk, lane });
  }
  return result;
}

/* ---------- Bulk ops ---------- */

function clearAll(){
  if (!confirm("Delete all classes from your schedule?")) return;
  classes = [];
  save();
  render();
}

/* ---------- Accessibility niceties ---------- */
// Keyboard: open Add modal with "n"
document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "n" && !classModal.open && !detailsModal.open){
    openAddModal();
  }
});
