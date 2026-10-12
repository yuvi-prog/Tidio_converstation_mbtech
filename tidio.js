const BASE = 'https://api.tidio.com';

function headers() {
  return {
    'X-Tidio-Openapi-Client-Id': process.env.TIDIO_CLIENT_ID,
    'X-Tidio-Openapi-Client-Secret': process.env.TIDIO_CLIENT_SECRET,
    'Accept': 'application/json; version=1',
  };
}

async function tidioGet(path) {
  const res = await fetch(`${BASE}${path}`, { headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Tidio ${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

// Returns contacts created within the last `days` days (paginated)
async function getRecentContacts(days = 3) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const contacts = [];
  let cursor = null;

  do {
    const url = cursor ? `/contacts?cursor=${cursor}` : '/contacts';
    const data = await tidioGet(url);
    for (const c of data.contacts) {
      if (new Date(c.created_at) >= cutoff) contacts.push(c);
    }
    // Stop paginating once contacts are older than cutoff
    const oldest = data.contacts[data.contacts.length - 1];
    if (!oldest || new Date(oldest.created_at) < cutoff) break;
    cursor = data.meta.cursor;
  } while (cursor);

  return contacts;
}

// Returns all messages for a contact, sorted oldest → newest
async function getContactMessages(contactId) {
  const messages = [];
  let cursor = null;

  do {
    const url = cursor
      ? `/contacts/${contactId}/messages?cursor=${cursor}`
      : `/contacts/${contactId}/messages`;
    const data = await tidioGet(url);
    messages.push(...data.messages);
    cursor = data.meta.cursor;
  } while (cursor);

  return messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

async function getContact(contactId) {
  try {
    return await tidioGet(`/contacts/${contactId}`);
  } catch (_) {
    return null;
  }
}

module.exports = { getRecentContacts, getContactMessages, getContact };
