const API_BASE_URL = "https://tigerbuzz-api.simonanders.workers.dev";
const WEEKDAY_START_MONDAY = true;

const state = {
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth(),
  monthCache: {},
  selectedKey: null,
  knownPeople: new Set(),
};

const MONTH_NAMES = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];

function monthKey(y, m) { return `${y}-${m}`; }

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

function combineDateTime(dateStr, timeStr) {
  return `${dateStr}T${timeStr}:00`;
}

/* ---------- Backend access ---------- */

function getPassphrase() {
  return sessionStorage.getItem("tigerbuzz-passphrase") || "";
}

function authHeaders() {
  return { Authorization: `Bearer ${encodeURIComponent(getPassphrase())}` };
}

function rememberPeople(bookings) {
  let changed = false;
  bookings.forEach((b) => {
    if (b.person && !state.knownPeople.has(b.person)) {
      state.knownPeople.add(b.person);
      changed = true;
    }
  });
  if (changed) {
    document.getElementById("borrower-list").innerHTML = Array.from(state.knownPeople)
      .sort()
      .map((name) => `<option value="${name}">`)
      .join("");
  }
}

function buildDayBookingsMap(rawBookings, year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const map = {};

  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(year, month, day);
    const dayStart = `${key}T00:00:00`;
    const next = new Date(year, month, day + 1);
    const nextDayStart = `${dateKey(next.getFullYear(), next.getMonth(), next.getDate())}T00:00:00`;

    const entries = rawBookings
      .filter((b) => b.start_at < nextDayStart && b.end_at > dayStart)
      .map((b) => {
        const start = b.start_at > dayStart ? b.start_at.slice(11, 16) : "00:00";
        const end = b.end_at < nextDayStart ? b.end_at.slice(11, 16) : "24:00";
        return {
          start,
          end,
          fullDay: start === "00:00" && end === "24:00",
          borrower: b.person,
          purpose: b.comment,
        };
      });

    if (entries.length) map[key] = entries;
  }

  return map;
}

async function loadMonthBookings(year, month, { force = false } = {}) {
  const key = monthKey(year, month);
  if (!force && state.monthCache[key]) return state.monthCache[key];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const from = dateKey(year, month, 1);
  const to = dateKey(year, month, daysInMonth);

  const res = await fetch(`${API_BASE_URL}/api/bookings?from=${from}&to=${to}`, {
    headers: authHeaders(),
  });

  if (!res.ok) throw new Error(`Failed to load bookings (${res.status})`);

  const { bookings } = await res.json();
  rememberPeople(bookings);
  const map = buildDayBookingsMap(bookings, year, month);
  state.monthCache[key] = map;
  return map;
}

function getCachedDayBookings(key) {
  const [y, m] = key.split("-").map(Number);
  const map = state.monthCache[monthKey(y, m - 1)];
  return (map && map[key]) || [];
}

/* ---------- Calendar ---------- */

async function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  const label = document.getElementById("month-label");
  label.textContent = `${MONTH_NAMES[state.viewMonth]} ${state.viewYear}`;

  grid.innerHTML = `<p class="calendar-loading">Laster …</p>`;

  let bookings;
  try {
    bookings = await loadMonthBookings(state.viewYear, state.viewMonth);
  } catch {
    grid.innerHTML = `<p class="calendar-loading">Kunne ikke laste kalenderen. Prøv igjen.</p>`;
    return;
  }

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
  renderCalendar().then(() => openDaySheet(key));
}

function openDaySheet(key) {
  const [y, m, d] = key.split("-").map(Number);
  const bookings = getCachedDayBookings(key);
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

/* ---------- Booking modal ---------- */

let validateTimer = null;
let validateToken = 0;

function scheduleValidate() {
  clearTimeout(validateTimer);
  validateTimer = setTimeout(validateBookingForm, 300);
}

async function validateBookingForm() {
  const token = ++validateToken;

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

  const startAt = combineDateTime(startDate, startTime);
  const endAt = combineDateTime(endDate, endTime);
  confirmBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE_URL}/api/bookings?from=${startDate}&to=${endDate}`, {
      headers: authHeaders(),
    });
    if (token !== validateToken) return;

    if (!res.ok) {
      conflictBox.textContent = "Kunne ikke sjekke ledighet. Prøv igjen.";
      conflictBox.hidden = false;
      return;
    }

    const { bookings } = await res.json();
    const conflict = bookings.find((b) => b.start_at < endAt && b.end_at > startAt);

    if (conflict) {
      conflictBox.textContent = `Krasjer med ${conflict.person} sin booking (${formatShortDate(conflict.start_at.slice(0, 10))} ${conflict.start_at.slice(11, 16)}–${conflict.end_at.slice(11, 16)}).`;
      conflictBox.hidden = false;
      confirmBtn.disabled = true;
      return;
    }

    conflictBox.hidden = true;
    confirmBtn.disabled = false;
  } catch {
    if (token !== validateToken) return;
    conflictBox.textContent = "Kunne ikke koble til serveren.";
    conflictBox.hidden = false;
  }
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

async function submitBooking(e) {
  e.preventDefault();

  const confirmBtn = document.getElementById("confirm-booking-btn");
  const conflictBox = document.getElementById("booking-conflict");

  const startDate = document.getElementById("booking-start-date").value;
  const endDate = document.getElementById("booking-end-date").value;
  const payload = {
    person: document.getElementById("booking-person").value.trim(),
    comment: document.getElementById("booking-comment").value.trim(),
    start_at: combineDateTime(startDate, document.getElementById("booking-start-time").value),
    end_at: combineDateTime(endDate, document.getElementById("booking-end-time").value),
  };

  confirmBtn.disabled = true;
  confirmBtn.textContent = "Booker …";

  try {
    const res = await fetch(`${API_BASE_URL}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });

    if (res.status === 409) {
      const data = await res.json();
      const c = data.conflict;
      conflictBox.textContent = `Krasjer med ${c.person} sin booking (${formatShortDate(c.start_at.slice(0, 10))} ${c.start_at.slice(11, 16)}–${c.end_at.slice(11, 16)}).`;
      conflictBox.hidden = false;
      return;
    }

    if (!res.ok) {
      conflictBox.textContent = "Noe gikk galt. Prøv igjen.";
      conflictBox.hidden = false;
      return;
    }

    document.getElementById("booking-sheet").hidden = true;

    const [y, m] = startDate.split("-").map(Number);
    state.viewYear = y;
    state.viewMonth = m - 1;
    state.selectedKey = startDate;

    await loadMonthBookings(y, m - 1, { force: true });
    if (endDate.slice(0, 7) !== startDate.slice(0, 7)) {
      const [ey, em] = endDate.split("-").map(Number);
      await loadMonthBookings(ey, em - 1, { force: true });
    }

    await renderCalendar();
    openDaySheet(startDate);
  } catch {
    conflictBox.textContent = "Kunne ikke koble til serveren.";
    conflictBox.hidden = false;
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Book Buzz'en";
  }
}

/* ---------- Passphrase gate ---------- */

async function verifyAndUnlock(passphrase) {
  const errorEl = document.getElementById("gate-error");
  try {
    const res = await fetch(`${API_BASE_URL}/api/bookings?from=${todayKey()}&to=${todayKey()}`, {
      headers: { Authorization: `Bearer ${encodeURIComponent(passphrase)}` },
    });

    if (res.ok) {
      sessionStorage.setItem("tigerbuzz-passphrase", passphrase);
      await unlockApp();
      return true;
    }

    errorEl.textContent = "Feil passord — prøv igjen.";
    errorEl.hidden = false;
    return false;
  } catch {
    errorEl.textContent = "Kunne ikke koble til serveren. Sjekk nettforbindelsen og prøv igjen.";
    errorEl.hidden = false;
    return false;
  }
}

async function unlockApp() {
  document.getElementById("gate").hidden = true;
  document.getElementById("app").hidden = false;
  await renderCalendar();
}

function initGate() {
  const form = document.getElementById("gate-form");
  const input = document.getElementById("passphrase");
  const submitBtn = form.querySelector("button[type=submit]");

  const stored = sessionStorage.getItem("tigerbuzz-passphrase");
  if (stored) {
    verifyAndUnlock(stored).then((ok) => {
      if (!ok) sessionStorage.removeItem("tigerbuzz-passphrase");
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) return;

    submitBtn.disabled = true;
    const ok = await verifyAndUnlock(value);
    submitBtn.disabled = false;

    if (!ok) {
      input.value = "";
      input.focus();
    }
  });
}

function initApp() {
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
      document.getElementById(id).addEventListener("input", scheduleValidate);
    });

  document.getElementById("booking-form").addEventListener("submit", submitBooking);

  document.getElementById("logout").addEventListener("click", () => {
    sessionStorage.removeItem("tigerbuzz-passphrase");
    document.getElementById("app").hidden = true;
    document.getElementById("gate").hidden = false;
    document.getElementById("gate-error").hidden = true;
    document.getElementById("passphrase").value = "";
    document.getElementById("passphrase").focus();
  });
}

initGate();
initApp();
