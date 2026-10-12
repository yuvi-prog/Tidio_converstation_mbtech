const { summarizeConversation } = require('./summarize');
const { sendConversationEmail } = require('./email');
const { queries } = require('./db');
const { v4: uuidv4 } = require('uuid');

const INACTIVITY_MS = (parseInt(process.env.INACTIVITY_MINUTES, 10) || 15) * 60 * 1000;
const LOOKBACK_MS   = 3 * 60 * 60 * 1000;

let running = false;

async function processSession(session, cutoff3h) {
  const { visitor_id, last_at } = session;

  // Only include messages after the previous email for this visitor, so returning visitors get a fresh transcript
  const existing = queries.threadEmailed.get(visitor_id);
  const since = existing && existing.emailed_at > cutoff3h ? existing.emailed_at : cutoff3h;
  if (existing && existing.emailed_at >= last_at) return;

  const rawEvents = queries.getSessionMessages.all(visitor_id, since);
  if (!rawEvents.length) return;
  if (!rawEvents.some(e => e.actor === 'visitor')) return; // bot greeting only, no real conversation
  console.log(`  Session ${visitor_id}: preparing email`);

  const messages = rawEvents.map(e => ({
    actor:           e.actor,
    message_content: e.message,
    time_sent:       e.received_at,
  }));
  const first = messages[0].time_sent;
  const last  = messages[messages.length - 1].time_sent;

  console.log(`  Session ${visitor_id}: ${messages.length} msgs`);

  let summary = `Conversation with ${messages.length} messages.`;
  try {
    summary = await summarizeConversation(messages, null);
  } catch (err) {
    console.error('  Summarize failed:', err.message);
  }

  const transcriptId = uuidv4();
  queries.insertTranscript.run(transcriptId, visitor_id, null, null, JSON.stringify(messages), summary);
  const transcriptUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/transcript/${transcriptId}`;

  try {
    await sendConversationEmail({
      contactName: null,
      contactEmail: null,
      summary,
      transcriptUrl,
      messageCount: messages.length,
      sessionStart: first,
      sessionEnd: last,
    });
    queries.upsertEmailedThread.run(
      visitor_id, visitor_id, null, null, transcriptId, first, last, messages.length, new Date().toISOString()
    );
    console.log(`  ✓ Email sent (transcript ${transcriptId})`);
  } catch (err) {
    console.error('  Email failed:', err.response?.body || err.message);
  }
}

async function runChatPoll() {
  if (running) return;
  running = true;
  try {
    const cutoff3h = new Date(Date.now() - LOOKBACK_MS).toISOString();
    const inactiveCutoff = new Date(Date.now() - INACTIVITY_MS).toISOString();
    const sessions = queries.getInactiveSessions.all(cutoff3h, inactiveCutoff);
    for (const session of sessions) {
      await processSession(session, cutoff3h);
    }
  } finally {
    running = false;
  }
}

module.exports = { runChatPoll };
