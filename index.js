require('dotenv').config();

const express = require('express');
const cron = require('node-cron');
const transcriptRouter = require('./transcript');
const { runPoll } = require('./poller');

const app = express();
const PORT = process.env.PORT || 3000;

// Transcript viewer
app.use(transcriptRouter);

// Health check
app.get('/', (req, res) => res.json({ status: 'ok', service: 'tidio-emailer' }));

// Run poll every 5 minutes
cron.schedule('*/5 * * * *', () => {
  runPoll().catch(err => console.error('Poll error:', err));
});

app.listen(PORT, () => {
  console.log(`Tidio emailer running on :${PORT}`);
  // Run once at startup so we don't have to wait 5 minutes
  runPoll().catch(err => console.error('Initial poll error:', err));
});
