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

async function runChatPoll() {
  const cutoff3h = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const inactiveCutoff = new Date(Date.now() - INACTIVITY_MS).toISOString();

  let sessions;
  try {
    sessions = queries.getInactiveSessions.all(cutoff3h, inactiveCutoff);
  } catch (err) {
    console.error('getInactiveSessions error:', err.message);
    return;
  }
  if (!sessions.length) return;

  console.log(`[chat-poll] ${sessions.length} inactive widget session(s)`);

  for (const session of sessions) {
    const { visitor_id, last_at, first_at, msg_count } = session;

    const existing = queries.threadEmailed.get(visitor_id);
    if (existing) {
      const emailedAt = new Date(existing.emailed_at).getTime();
      const lastMsgAt = new Date(last_at).getTime();
      if (emailedAt > lastMsgAt) continue;
    }

    const rawEvents = queries.getSessionMessages.all(visitor_id, cutoff3h);
    const messages = rawEvents.map(e => ({
      actor:           e.actor,
      message_content: e.message,
      time_sent:       e.received_at,
      thread_id:       visitor_id,
      visitor_id:      visitor_id,
    }));

    const minsAgo = Math.round((Date.now() - new Date(last_at).getTime()) / 60000);
    console.log(`  Widget ${visitor_id}: ${messages.length} msgs, last ${minsAgo}min ago`);

    let summary = `Conversation with ${messages.length} messages.`;
    try {
      summary = await summarizeConversation(messages, null);
    } catch (err) {
      console.error('  Summarize failed:', err.message);
    }

    const transcriptId = uuidv4();
    queries.insertTranscript.run(
      transcriptId, visitor_id, null, null,
      JSON.stringify(messages), summary
    );

    const transcriptUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/transcript/${transcriptId}`;

    try {
      await sendConversationEmail({
        contactName:  null,
        contactEmail: null,
        summary,
        transcriptUrl,
        messageCount: messages.length,
        sessionStart: first_at,
        sessionEnd:   last_at,
      });

      queries.insertEmailedThread.run(
        visitor_id, visitor_id, null, null,
        transcriptId, first_at, last_at, messages.length
      );

      console.log(`  ✓ Widget email sent (transcript ${transcriptId})`);
    } catch (err) {
      console.error('  Email failed:', err.message);
    }
  }
}

module.exports = { runPoll, runChatPoll };
