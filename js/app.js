const MOCK_PASSPHRASES = ["roar", "tigerbuzz"];
const WEEKDAY_START_MONDAY = true;

const state = {
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth(),
  monthCache: {},
  selectedKey: null,
};

const MONTH_NAMES = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];

function monthKey(y, m) { return `${y}-${m}`; }

function getMonthBookings(y, m) {
  const key = monthKey(y, m);
  if (!state.monthCache[key]) {
    state.monthCache[key] = generateBookingsForMonth(y, m);
  }
  return state.monthCache[key];
}

function todayKey() {
  const t = new Date();
  return dateKey(t.getFullYear(), t.getMonth(), t.getDate());
}

function formatLongDate(y, m, d) {
  return new Date(y, m, d).toLocaleDateString("nb-NO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function formatShortDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
}

function statusLabel(status) {
  return { green: "Ledig", yellow: "Delvis booket", red: "Fullbooket" }[status];
}

function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  const label = document.getElementById("month-label");
  label.textContent = `${MONTH_NAMES[state.viewMonth]} ${state.viewYear}`;

  const bookings = getMonthBookings(state.viewYear, state.viewMonth);
  const firstDow = new Date(state.viewYear, state.viewMonth, 1).getDay();
  const leadingBlanks = WEEKDAY_START_MONDAY ? (firstDow + 6) % 7 : firstDow;
  const daysInMonth = new Date(state.viewYear, state.viewMonth + 1, 0).getDate();
  const today = todayKey();

  grid.innerHTML = "";

  for (let i = 0; i < leadingBlanks; i++) {
    const blank = document.createElement("div");
    blank.className = "day-cell empty";
    grid.appendChild(blank);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(state.viewYear, state.viewMonth, day);
    const status = getDayStatus(bookings[key]);
    const cell = document.createElement("button");
    cell.className = `day-cell status-${status}`;
    cell.type = "button";
    cell.dataset.key = key;
    cell.setAttribute("aria-label", `${formatLongDate(state.viewYear, state.viewMonth, day)}, ${statusLabel(status)}`);

    if (key === today) cell.classList.add("is-today");
    if (key < today) cell.classList.add("is-past");
    if (key === state.selectedKey) cell.classList.add("is-selected");

    cell.innerHTML = `${day}<span class="status-dot"></span>`;
    cell.addEventListener("click", () => selectDay(key));
    grid.appendChild(cell);
  }
}

function selectDay(key) {
  state.selectedKey = key;
  renderCalendar();
  openDaySheet(key);
}

function openDaySheet(key) {
  const [y, m, d] = key.split("-").map(Number);
  const bookings = getMonthBookings(y, m - 1)[key] || [];
  const status = getDayStatus(bookings);

  document.getElementById("sheet-date").textContent = formatLongDate(y, m - 1, d);
  const statusEl = document.getElementById("sheet-status");
  statusEl.textContent = statusLabel(status);
  statusEl.className = `sheet-status status-${status}`;

  const list = document.getElementById("sheet-bookings");
  list.innerHTML = "";

  if (bookings.length === 0) {
    list.innerHTML = `<div class="empty-state">Ingen bookinger enda — Buzz'en er ledig hele dagen. 🐯</div>`;
  } else {
    bookings
      .slice()
      .sort((a, b) => a.start.localeCompare(b.start))
      .forEach((b) => {
        const row = document.createElement("div");
        row.className = `booking-row${b.fullDay ? " full-day" : ""}`;
        row.innerHTML = `
          <span class="booking-time">${b.fullDay ? "Hele dagen" : `${b.start}–${b.end}`}</span>
          <div class="booking-info">
            <p class="booking-name">${b.borrower}</p>
            <p class="booking-purpose">${b.purpose}</p>
          </div>
        `;
        list.appendChild(row);
      });
  }

  document.getElementById("sheet-backdrop").hidden = false;
  const sheet = document.getElementById("day-sheet");
  sheet.hidden = false;
  sheet.setAttribute("aria-hidden", "false");
}

function closeAllSheets() {
  document.getElementById("sheet-backdrop").hidden = true;
  const sheet = document.getElementById("day-sheet");
  sheet.hidden = true;
  sheet.setAttribute("aria-hidden", "true");
  const modal = document.getElementById("booking-sheet");
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  state.selectedKey = null;
  renderCalendar();
}

function changeMonth(delta) {
  state.viewMonth += delta;
  if (state.viewMonth > 11) { state.viewMonth = 0; state.viewYear++; }
  if (state.viewMonth < 0) { state.viewMonth = 11; state.viewYear--; }
  state.selectedKey = null;
  renderCalendar();
}

/* ---------- Booking modal: conflict-aware start/end range ---------- */

function eachDateInRange(startKey, endKey) {
  const [sy, sm, sd] = startKey.split("-").map(Number);
  const [ey, em, ed] = endKey.split("-").map(Number);
  const cursor = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const keys = [];
  while (cursor <= end) {
    keys.push(dateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function toMinutes(hhmm) {
  if (hhmm === "24:00") return 1440;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function timeRangesOverlap(aStart, aEnd, bStart, bEnd) {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

function checkConflicts(startKey, startTime, endKey, endTime) {
  const dates = eachDateInRange(startKey, endKey);
  const conflicts = [];

  dates.forEach((key, idx) => {
    const winStart = idx === 0 ? startTime : "00:00";
    const winEnd = idx === dates.length - 1 ? endTime : "24:00";
    const [y, m, d] = key.split("-").map(Number);
    const dayBookings = getMonthBookings(y, m - 1)[key] || [];

    dayBookings.forEach((b) => {
      const bStart = b.fullDay ? "00:00" : b.start;
      const bEnd = b.fullDay ? "24:00" : b.end;
      if (timeRangesOverlap(winStart, winEnd, bStart, bEnd)) {
        conflicts.push({ date: key, booking: b });
      }
    });
  });

  return conflicts;
}

function commitBooking({ person, comment, startKey, startTime, endKey, endTime }) {
  const dates = eachDateInRange(startKey, endKey);

  dates.forEach((key, idx) => {
    const dayStart = idx === 0 ? startTime : "00:00";
    const dayEnd = idx === dates.length - 1 ? endTime : "24:00";
    const [y, m] = key.split("-").map(Number);
    const monthBookings = getMonthBookings(y, m - 1);
    if (!monthBookings[key]) monthBookings[key] = [];

    monthBookings[key].push({
      start: dayStart,
      end: dayEnd,
      fullDay: dayStart === "00:00" && dayEnd === "24:00",
      borrower: person,
      purpose: comment,
    });
  });
}

function validateBookingForm() {
  const person = document.getElementById("booking-person").value.trim();
  const comment = document.getElementById("booking-comment").value.trim();
  const startDate = document.getElementById("booking-start-date").value;
  const startTime = document.getElementById("booking-start-time").value;
  const endDate = document.getElementById("booking-end-date").value;
  const endTime = document.getElementById("booking-end-time").value;

  const confirmBtn = document.getElementById("confirm-booking-btn");
  const conflictBox = document.getElementById("booking-conflict");

  if (!person || !comment || !startDate || !startTime || !endDate || !endTime) {
    conflictBox.hidden = true;
    confirmBtn.disabled = true;
    return;
  }

  if (endDate < startDate || (endDate === startDate && endTime <= startTime)) {
    conflictBox.textContent = "Slutten må være etter starten.";
    conflictBox.hidden = false;
    confirmBtn.disabled = true;
    return;
  }

  const conflicts = checkConflicts(startDate, startTime, endDate, endTime);
  if (conflicts.length > 0) {
    const c = conflicts[0];
    const when = c.booking.fullDay ? "hele dagen" : `${c.booking.start}–${c.booking.end}`;
    conflictBox.textContent = `Krasjer med ${c.booking.borrower} sin booking ${formatShortDate(c.date)} (${when}).`;
    conflictBox.hidden = false;
    confirmBtn.disabled = true;
    return;
  }

  conflictBox.hidden = true;
  confirmBtn.disabled = false;
}

function openBookingModal(prefillKey) {
  const form = document.getElementById("booking-form");
  form.reset();
  document.getElementById("booking-start-date").value = prefillKey;
  document.getElementById("booking-start-time").value = "09:00";
  document.getElementById("booking-end-date").value = prefillKey;
  document.getElementById("booking-end-time").value = "17:00";

  document.getElementById("sheet-backdrop").hidden = false;
  const modal = document.getElementById("booking-sheet");
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");

  validateBookingForm();
}

function unlockApp() {
  document.getElementById("gate").hidden = true;
  document.getElementById("app").hidden = false;
  renderCalendar();
}

function initGate() {
  const form = document.getElementById("gate-form");
  const input = document.getElementById("passphrase");
  const error = document.getElementById("gate-error");

  if (sessionStorage.getItem("tigerbuzz-unlocked") === "1") {
    unlockApp();
    return;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = input.value.trim().toLowerCase();
    if (MOCK_PASSPHRASES.includes(value)) {
      sessionStorage.setItem("tigerbuzz-unlocked", "1");
      unlockApp();
    } else {
      error.hidden = false;
      input.value = "";
      input.focus();
    }
  });
}

function initApp() {
  document.getElementById("borrower-list").innerHTML = BORROWERS
    .map((name) => `<option value="${name}">`)
    .join("");

  document.getElementById("prev-month").addEventListener("click", () => changeMonth(-1));
  document.getElementById("next-month").addEventListener("click", () => changeMonth(1));

  document.getElementById("sheet-close").addEventListener("click", closeAllSheets);
  document.getElementById("sheet-backdrop").addEventListener("click", closeAllSheets);
  document.getElementById("booking-close").addEventListener("click", closeAllSheets);

  document.getElementById("open-booking-btn").addEventListener("click", () => {
    openBookingModal(state.selectedKey || todayKey());
  });

  ["booking-person", "booking-comment", "booking-start-date", "booking-start-time", "booking-end-date", "booking-end-time"]
    .forEach((id) => {
      document.getElementById(id).addEventListener("input", validateBookingForm);
    });

  document.getElementById("booking-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const startKey = document.getElementById("booking-start-date").value;
    const endKey = document.getElementById("booking-end-date").value;

    commitBooking({
      person: document.getElementById("booking-person").value.trim(),
      comment: document.getElementById("booking-comment").value.trim(),
      startKey,
      startTime: document.getElementById("booking-start-time").value,
      endKey,
      endTime: document.getElementById("booking-end-time").value,
    });

    const modal = document.getElementById("booking-sheet");
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    state.selectedKey = startKey;
    renderCalendar();
    openDaySheet(startKey);
  });

  document.getElementById("logout").addEventListener("click", () => {
    sessionStorage.removeItem("tigerbuzz-unlocked");
    document.getElementById("app").hidden = true;
    document.getElementById("gate").hidden = false;
    document.getElementById("passphrase").value = "";
    document.getElementById("passphrase").focus();
  });
}

initGate();
initApp();
