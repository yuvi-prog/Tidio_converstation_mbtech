const { getRecentContacts, getContactMessages } = require('./tidio');
const { summarizeConversation } = require('./summarize');
const { sendConversationEmail } = require('./email');
const { queries } = require('./db');
const { v4: uuidv4 } = require('uuid');

const INACTIVITY_MS = (parseInt(process.env.INACTIVITY_MINUTES, 10) || 15) * 60 * 1000;
const LOOKBACK_MS   = 3 * 60 * 60 * 1000; // only care about last 3 hours of activity

// Normalise OpenAPI message shape to the fields the rest of the code uses
function normalise(msg, contactId) {
  return {
    actor:           msg.author_type === 'contact' ? 'visitor' :
                     msg.author_type === 'operator' ? 'agent' : 'bot',
    message_content: msg.message,
    time_sent:       msg.created_at,
    thread_id:       contactId,   // use contact ID as session key
    visitor_id:      contactId,
    conversation_link: msg.conversation_url || null,
  };
}

async function processContact(contact) {
  const contactId = contact.id;
  const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || null;

  let rawMessages;
  try {
    rawMessages = await getContactMessages(contactId);
  } catch (err) {
    console.error(`  Messages error for ${contactId}:`, err.message);
    return;
  }

  if (!rawMessages.length) return;

  // Only look at messages from the last 3 hours
  const cutoff = Date.now() - LOOKBACK_MS;
  const recent = rawMessages.filter(m => new Date(m.created_at).getTime() >= cutoff);
  if (!recent.length) return;

  const lastMsg  = recent[recent.length - 1];
  const msSince  = Date.now() - new Date(lastMsg.created_at).getTime();
  if (msSince < INACTIVITY_MS) return; // still active

  // Already emailed for this contact's latest session?
  const existing = queries.threadEmailed.get(contactId);
  if (existing) {
    const emailedAt = new Date(existing.emailed_at).getTime();
    const lastMsgAt = new Date(lastMsg.created_at).getTime();
    if (emailedAt > lastMsgAt) return; // already covered
  }

  const messages = recent.map(m => normalise(m, contactId));
  const firstMsg = messages[0];

  console.log(`  Contact ${contactName || contactId}: ${messages.length} msgs, last ${Math.round(msSince / 60000)}min ago`);

  let summary = `Conversation with ${messages.length} messages.`;
  try {
    summary = await summarizeConversation(messages, contactName);
  } catch (err) {
    console.error('  Summarize failed:', err.message);
  }

  const transcriptId = uuidv4();
  queries.insertTranscript.run(
    transcriptId, contactId, contactName, contact.email,
    JSON.stringify(messages), summary
  );

  const transcriptUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/transcript/${transcriptId}`;

  try {
    await sendConversationEmail({
      contactName,
      contactEmail: contact.email,
      summary,
      transcriptUrl,
      messageCount: messages.length,
      sessionStart: firstMsg.time_sent,
      sessionEnd:   lastMsg.created_at,
    });

    queries.insertEmailedThread.run(
      contactId, contactId, contactName, contact.email,
      transcriptId, firstMsg.time_sent, lastMsg.created_at, messages.length
    );

    console.log(`  ✓ Email sent (transcript ${transcriptId})`);
  } catch (err) {
    console.error('  Email failed:', err.message);
  }
}

async function runPoll() {
  console.log(`[${new Date().toISOString()}] Polling Tidio…`);
  let contacts;
  try {
    contacts = await getRecentContacts(3);
  } catch (err) {
    console.error('Failed to fetch contacts:', err.message);
    return;
  }
  console.log(`${contacts.length} recent contact(s)`);
  for (const contact of contacts) {
    await processContact(contact);
  }
}

module.exports = { runPoll };
