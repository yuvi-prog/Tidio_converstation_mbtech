require('dotenv').config();

const express = require('express');
const cron = require('node-cron');
const transcriptRouter = require('./transcript');
const { runPoll } = require('./poller');
const { getRecentMessagesByThread, getContact } = require('./tidio');
const { summarizeConversation } = require('./summarize');
const { sendConversationEmail } = require('./email');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Transcript viewer
app.use(transcriptRouter);

// Health check
app.get('/', (req, res) => res.json({ status: 'ok', service: 'tidio-emailer' }));

// Test endpoint — sends the most recent conversation to yuvi only, no DB write
app.get('/test', async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // last 24h
    const threads = await getRecentMessagesByThread(since);

    if (threads.size === 0) {
      return res.json({ ok: false, message: 'No conversations found in the last 24 hours.' });
    }

    // Pick the thread with the most recent last message
    let bestThread = null, bestMessages = null, bestTime = 0;
    for (const [, messages] of threads) {
      const t = new Date(messages[messages.length - 1].time_sent).getTime();
      if (t > bestTime) { bestTime = t; bestThread = messages[0].thread_id; bestMessages = messages; }
    }

    const visitorId = bestMessages[0].visitor_id;
    let contact = null;
    try { contact = await getContact(String(visitorId)); } catch (_) {}

    const contactName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || null : null;
    const contactEmail = contact?.email || null;

    const summary = await summarizeConversation(bestMessages, contactName);
    const transcriptId = uuidv4();
    const transcriptUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/transcript/${transcriptId}`;

    // Store transcript so the link works
    const { queries } = require('./db');
    queries.insertTranscript.run(
      transcriptId, String(bestThread), contactName, contactEmail,
      JSON.stringify(bestMessages), summary
    );

    await sendConversationEmail({
      contactName, contactEmail, summary, transcriptUrl,
      messageCount: bestMessages.length,
      sessionStart: bestMessages[0].time_sent,
      sessionEnd: bestMessages[bestMessages.length - 1].time_sent,
    }, ['yuvi@memoryblock.com.au']);

    res.json({ ok: true, message: `Test email sent to yuvi@memoryblock.com.au`, thread: bestThread, messages: bestMessages.length, contact: contactName || visitorId });
  } catch (err) {
    console.error('Test error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Run poll every 5 minutes
cron.schedule('*/5 * * * *', () => {
  runPoll().catch(err => console.error('Poll error:', err));
});

app.listen(PORT, () => {
  console.log(`Tidio emailer running on :${PORT}`);
  // Run once at startup so we don't have to wait 5 minutes
  runPoll().catch(err => console.error('Initial poll error:', err));
});
