function pad(n) { return String(n).padStart(2, "0"); }

function dateKey(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function getDayStatus(dayBookings) {
  if (!dayBookings || dayBookings.length === 0) return "green";
  if (dayBookings.some((b) => b.fullDay)) return "red";
  return "yellow";
}
