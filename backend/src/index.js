function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

function isAuthorized(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || !token || !env.PASSPHRASE) return false;

  let decoded;
  try {
    decoded = decodeURIComponent(token);
  } catch {
    return false;
  }

  return decoded === env.PASSPHRASE;
}

async function handleListBookings(url, env, origin) {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!from || !to) {
    return json({ error: "Query params 'from' and 'to' are required (YYYY-MM-DD)." }, 400, origin);
  }

  const rangeStart = `${from}T00:00:00`;
  const rangeEnd = `${to}T23:59:59`;

  const { results } = await env.DB.prepare(
    `SELECT id, person, comment, start_at, end_at FROM bookings
     WHERE start_at < ?2 AND end_at > ?1
     ORDER BY start_at ASC`
  ).bind(rangeStart, rangeEnd).all();

  return json({ bookings: results }, 200, origin);
}

async function handleCreateBooking(request, env, origin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400, origin);
  }

  const person = (body.person || "").trim();
  const comment = (body.comment || "").trim();
  const startAt = body.start_at;
  const endAt = body.end_at;

  if (!person || !comment || !startAt || !endAt) {
    return json({ error: "person, comment, start_at and end_at are all required." }, 400, origin);
  }

  const startDate = new Date(startAt);
  const endDate = new Date(endAt);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    return json({ error: "end_at must be a valid date after start_at." }, 400, origin);
  }

  const { results: conflicts } = await env.DB.prepare(
    `SELECT id, person, comment, start_at, end_at FROM bookings
     WHERE start_at < ?2 AND end_at > ?1
     LIMIT 1`
  ).bind(startAt, endAt).all();

  if (conflicts.length > 0) {
    return json({ error: "This overlaps an existing booking.", conflict: conflicts[0] }, 409, origin);
  }

  const { results: inserted } = await env.DB.prepare(
    `INSERT INTO bookings (person, comment, start_at, end_at)
     VALUES (?1, ?2, ?3, ?4)
     RETURNING id, person, comment, start_at, end_at`
  ).bind(person, comment, startAt, endAt).all();

  return json({ booking: inserted[0] }, 201, origin);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.ALLOWED_ORIGIN || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (!isAuthorized(request, env)) {
      return json({ error: "Unauthorized" }, 401, origin);
    }

    if (url.pathname === "/api/bookings" && request.method === "GET") {
      return handleListBookings(url, env, origin);
    }

    if (url.pathname === "/api/bookings" && request.method === "POST") {
      return handleCreateBooking(request, env, origin);
    }

    return json({ error: "Not found" }, 404, origin);
  },
};
