require('dotenv').config();

const express = require('express');
const cron = require('node-cron');

const transcriptRouter = require('./transcript');
const { runChatPoll } = require('./poller');
const { queries } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const ACTORS = new Set(['visitor', 'bot']);
const MAX_MESSAGE_LEN = 4000;
const MAX_EVENTS_PER_HOUR = 300;

app.use(express.json({ limit: '16kb' }));

app.options('/chat-event', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

app.post('/chat-event', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { visitorId, actor, message } = req.body || {};
  if (typeof visitorId !== 'string' || !/^v-[\w-]{1,60}$/.test(visitorId) ||
      !ACTORS.has(actor) || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'invalid' });
  }
  try {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    if (queries.countRecentEvents.get(visitorId, hourAgo).n >= MAX_EVENTS_PER_HOUR) {
      return res.status(429).json({ error: 'rate limited' });
    }
    queries.insertChatEvent.run(visitorId, actor, message.trim().slice(0, MAX_MESSAGE_LEN), new Date().toISOString());
    res.json({ ok: true });
  } catch (err) {
    console.error('chat-event insert error:', err.message);
    res.status(500).json({ error: 'db error' });
  }
});

app.use(transcriptRouter);

app.get('/', (req, res) => res.json({ status: 'ok', service: 'tidio-emailer' }));

cron.schedule('*/5 * * * *', () => {
  runChatPoll().catch(err => console.error('Chat poll error:', err));
});

app.listen(PORT, () => {
  console.log(`Tidio emailer running on :${PORT}`);
  runChatPoll().catch(err => console.error('Initial chat poll error:', err));
});
