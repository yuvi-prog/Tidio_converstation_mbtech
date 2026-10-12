const { getRecentMessagesByThread, getContact } = require('./tidio');
const { summarizeConversation } = require('./summarize');
const { sendConversationEmail } = require('./email');
const { queries } = require('./db');
const { v4: uuidv4 } = require('uuid');

const INACTIVITY_MS = (parseInt(process.env.INACTIVITY_MINUTES, 10) || 15) * 60 * 1000;
const LOOKBACK_MS = 3 * 60 * 60 * 1000; // only look at the last 3 hours

function isoMsAgo(ms) {
  return new Date(Date.now() - ms).toISOString();
}

async function runPoll() {
  console.log(`[${new Date().toISOString()}] Polling Tidio…`);

  let threads;
  try {
    threads = await getRecentMessagesByThread(isoMsAgo(LOOKBACK_MS));
  } catch (err) {
    console.error('Failed to fetch Tidio messages:', err.message);
    return;
  }

  console.log(`Found ${threads.size} active thread(s) in last ${LOOKBACK_MS / 60000} min`);

  for (const [threadId, messages] of threads) {
    const lastMsg = messages[messages.length - 1];
    const lastMsgAt = new Date(lastMsg.time_sent);
    const msSinceLast = Date.now() - lastMsgAt.getTime();

    // Must be inactive for at least INACTIVITY_MS
    if (msSinceLast < INACTIVITY_MS) continue;

    // Already emailed this thread?
    const existing = queries.threadEmailed.get(threadId);
    if (existing) continue;

    const visitorId = lastMsg.visitor_id;
    const firstMsg = messages[0];

    // Fetch contact details (best-effort — falls back to visitor_id)
    let contact = null;
    try {
      contact = await getContact(visitorId);
    } catch (_) {}

    const contactName = contact
      ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || null
      : null;
    const contactEmail = contact?.email || null;

    console.log(`  Thread ${threadId}: ${messages.length} msgs, last ${Math.round(msSinceLast / 60000)}min ago — sending email for ${contactName || visitorId}`);

    // Summarise
    let summary = `Conversation with ${messages.length} messages.`;
    try {
      summary = await summarizeConversation(messages, contactName);
    } catch (err) {
      console.error('  Summarize failed:', err.message);
    }

    // Store transcript
    const transcriptId = uuidv4();
    queries.insertTranscript.run(
      transcriptId, threadId, contactName, contactEmail,
      JSON.stringify(messages), summary
    );

    const transcriptUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/transcript/${transcriptId}`;

    // Send email
    try {
      await sendConversationEmail({
        contactName,
        contactEmail,
        summary,
        transcriptUrl,
        messageCount: messages.length,
        sessionStart: firstMsg.time_sent,
        sessionEnd: lastMsg.time_sent,
      });

      queries.insertEmailedThread.run(
        threadId, visitorId, contactName, contactEmail,
        transcriptId, firstMsg.time_sent, lastMsg.time_sent, messages.length
      );

      console.log(`  ✓ Email sent (transcript: ${transcriptId})`);
    } catch (err) {
      console.error('  Email failed:', err.message);
    }
  }
}

module.exports = { runPoll };
