const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'tidio.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS emailed_threads (
    thread_id     TEXT PRIMARY KEY,
    visitor_id    TEXT,
    contact_name  TEXT,
    contact_email TEXT,
    transcript_id TEXT UNIQUE,
    session_start TEXT,
    session_end   TEXT,
    message_count INTEGER,
    emailed_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transcripts (
    id            TEXT PRIMARY KEY,
    thread_id     TEXT,
    contact_name  TEXT,
    contact_email TEXT,
    messages      TEXT,
    summary       TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );
`);

const queries = {
  threadEmailed: db.prepare('SELECT emailed_at FROM emailed_threads WHERE thread_id = ?'),

  insertEmailedThread: db.prepare(`
    INSERT OR IGNORE INTO emailed_threads
      (thread_id, visitor_id, contact_name, contact_email, transcript_id, session_start, session_end, message_count)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?)
  `),

  insertTranscript: db.prepare(`
    INSERT INTO transcripts (id, thread_id, contact_name, contact_email, messages, summary)
    VALUES (?, ?, ?, ?, ?, ?)
  `),

  getTranscript: db.prepare('SELECT * FROM transcripts WHERE id = ?'),
};

module.exports = { db, queries };
