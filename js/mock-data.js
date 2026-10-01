// Deterministic mock booking data — swapped for a real API later.

const BORROWERS = [
  "Kine (publikumsvert)", "Anders (tekniker)", "Mari (regissør)", "Jonas (rekvisitør)",
  "Silje (skuespiller)", "Espen (produsent)", "Nora (kostyme)", "Trym (lyd)",
];

const PURPOSES = [
  "Henting av rekvisitter fra lager", "Skyss av skuespiller til spillested", "Levering av scenografi",
  "Tur til flyplassen", "Innlasting til turnéforestilling", "IKEA-tur for ny scenografi",
  "Henting til kostymeprøve", "Besøk til skole (formidling)",
];

function seededRandom(seedStr) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = (Math.imul(31, h) + seedStr.charCodeAt(i)) | 0;
  }
  return function next() {
    h = (Math.imul(h, 1664525) + 1013904223) | 0;
    return ((h >>> 0) / 4294967296);
  };
}

function pad(n) { return String(n).padStart(2, "0"); }

function dateKey(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function generateBookingsForMonth(year, month) {
  const rand = seededRandom(`tigerbuzz-${year}-${month}`);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const bookings = {};

  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(year, month, day);
    const roll = rand();
    const dayBookings = [];

    if (roll < 0.4) {
      // free day
    } else if (roll < 0.55) {
      dayBookings.push({
        start: "00:00", end: "23:59", fullDay: true,
        borrower: BORROWERS[Math.floor(rand() * BORROWERS.length)],
        purpose: PURPOSES[Math.floor(rand() * PURPOSES.length)],
      });
    } else {
      const count = roll < 0.8 ? 1 : 2;
      for (let i = 0; i < count; i++) {
        const startHour = 8 + Math.floor(rand() * 10);
        const duration = 1 + Math.floor(rand() * 3);
        dayBookings.push({
          start: `${pad(startHour)}:00`,
          end: `${pad(Math.min(startHour + duration, 22))}:00`,
          fullDay: false,
          borrower: BORROWERS[Math.floor(rand() * BORROWERS.length)],
          purpose: PURPOSES[Math.floor(rand() * PURPOSES.length)],
        });
      }
    }

    if (dayBookings.length) bookings[key] = dayBookings;
  }

  return bookings;
}

function getDayStatus(dayBookings) {
  if (!dayBookings || dayBookings.length === 0) return "green";
  if (dayBookings.some((b) => b.fullDay)) return "red";
  return "yellow";
}
