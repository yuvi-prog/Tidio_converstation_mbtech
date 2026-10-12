const OPENAPI_BASE = 'https://api.tidio.com';
const ANALYTICS_BASE = 'https://taa.data.tidio.com';

function authHeaders() {
  return {
    'X-Tidio-Openapi-Client-Id': process.env.TIDIO_CLIENT_ID,
    'X-Tidio-Openapi-Client-Secret': process.env.TIDIO_CLIENT_SECRET,
    'Accept': 'application/json; version=1',
    'Content-Type': 'application/json',
  };
}

// Returns messages sent since `since` (ISO string), grouped by thread_id.
// Uses the analytics API so one request covers all visitors.
async function getRecentMessagesByThread(since) {
  const url = new URL(`${ANALYTICS_BASE}/live_chat_message_details`);
  url.searchParams.set('time_sent', `gte.${since}`);
  url.searchParams.set('order', 'time_sent.asc');
  url.searchParams.set('limit', '1000');

  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Tidio analytics error ${res.status}: ${body}`);
  }

  const rows = await res.json();

  // Group by thread_id
  const threads = new Map();
  for (const row of rows) {
    const key = String(row.thread_id);
    if (!threads.has(key)) threads.set(key, []);
    threads.get(key).push(row);
  }
  return threads; // Map<thread_id, message[]>
}

// Fetch contact details (name + email) for a visitor_id.
// visitor_id from the analytics API appears to match the contact UUID in the OpenAPI.
async function getContact(visitorId) {
  const res = await fetch(`${OPENAPI_BASE}/contacts/${visitorId}`, {
    headers: authHeaders(),
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
}

module.exports = { getRecentMessagesByThread, getContact };
