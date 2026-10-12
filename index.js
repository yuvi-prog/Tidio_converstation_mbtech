require('dotenv').config();

const express = require('express');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');

const transcriptRouter = require('./transcript');
const { runPoll } = require('./poller');
const { getRecentContacts, getContactMessages } = require('./tidio');
const { summarizeConversation } = require('./summarize');
const { sendConversationEmail } = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(transcriptRouter);

app.get('/', (req, res) => res.json({ status: 'ok', service: 'tidio-emailer' }));

// Test endpoint — finds the most recent conversation and emails just yuvi
app.get('/test', async (req, res) => {
  try {
    const { queries } = require('./db');
    const contacts = await getRecentContacts(7); // look back 7 days

    if (!contacts.length) {
      return res.json({ ok: false, message: 'No contacts found in the last 7 days.' });
    }

    // Find contact with the most recent message
    let bestContact = null, bestRaw = null, bestTime = 0;
    for (const contact of contacts) {
      const msgs = await getContactMessages(contact.id);
      if (!msgs.length) continue;
      const t = new Date(msgs[msgs.length - 1].created_at).getTime();
      if (t > bestTime) { bestTime = t; bestContact = contact; bestRaw = msgs; }
    }

    if (!bestRaw) {
      return res.json({ ok: false, message: 'No messages found for recent contacts.' });
    }

    const contactName  = [bestContact.first_name, bestContact.last_name].filter(Boolean).join(' ') || null;
    const contactEmail = bestContact.email || null;

    // Normalise to common shape
    const messages = bestRaw.map(m => ({
      actor:             m.author_type === 'contact'  ? 'visitor' :
                         m.author_type === 'operator' ? 'agent' : 'bot',
      message_content:   m.message,
      time_sent:         m.created_at,
      conversation_link: m.conversation_url || null,
    }));

    const summary      = await summarizeConversation(messages, contactName);
    const transcriptId = uuidv4();
    const transcriptUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/transcript/${transcriptId}`;

    queries.insertTranscript.run(
      transcriptId, bestContact.id, contactName, contactEmail,
      JSON.stringify(messages), summary
    );

    await sendConversationEmail({
      contactName, contactEmail, summary, transcriptUrl,
      messageCount: messages.length,
      sessionStart: messages[0].time_sent,
      sessionEnd:   messages[messages.length - 1].time_sent,
    }, ['yuvi@memoryblock.com.au']);

    res.json({ ok: true, message: 'Test email sent to yuvi@memoryblock.com.au', contact: contactName || bestContact.id, messages: messages.length });
  } catch (err) {
    console.error('Test error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Poll every 5 minutes
cron.schedule('*/5 * * * *', () => {
  runPoll().catch(err => console.error('Poll error:', err));
});

app.listen(PORT, () => {
  console.log(`Tidio emailer running on :${PORT}`);
  runPoll().catch(err => console.error('Initial poll error:', err));
});
